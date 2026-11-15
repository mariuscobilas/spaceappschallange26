#!/usr/bin/env python3
"""Prepare county summaries of the authors' published outputs; do not fit any model."""
from __future__ import annotations
import argparse
import csv
import hashlib
import io
import json
import math
import sys
import zipfile
from collections import defaultdict, Counter
from pathlib import Path
from statistics import fmean

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_SHA256 = '619c191fe4231f1aa8d15075879484155d587413c010dac5492b00c50bf88ff0'
ARCHIVE_MD5 = '8bf24757d697d57f3e0087e8dd8e34bb'
ARCHIVE_URL = 'https://zenodo.org/api/records/7199708/files/Deines_etal_2022_GCB_coverCropsAndYields-v1.0.0.zip/content'
STATES = {'17':'IL','18':'IN','19':'IA','26':'MI','29':'MO','39':'OH'}
MIN_RECORDS = 10


def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(',',':'), allow_nan=False)+'\n').encode()


def finite(value):
    result=float(value)
    if not math.isfinite(result):raise ValueError('Nonfinite published prediction')
    return result


def prepare(archive: Path):
    # Importer-only dependencies, pinned in docs/REGIONAL-ATLAS.md. None run in API.
    import shapefile
    from pyproj import CRS, Transformer
    from shapely import get_coordinates, set_precision
    from shapely.geometry import shape, mapping
    from shapely.ops import transform
    if archive.stat().st_size != 84279382:
        raise ValueError('Unexpected archive size')
    body=archive.read_bytes()
    if hashlib.sha256(body).hexdigest()!=ARCHIVE_SHA256 or hashlib.md5(body).hexdigest()!=ARCHIVE_MD5:
        raise ValueError('Source archive checksum mismatch')
    source_hashes={}
    groups=defaultdict(list)
    counts={}
    excluded_reference_counts={}
    comparison_error=0.0
    with zipfile.ZipFile(io.BytesIO(body)) as z:
        prefix=z.namelist()[0].split('/')[0]+'/'
        # Do NOT extract archive or inspect raw point-sample coordinate columns.
        # Read only named, allowlisted fields from the published CATE outputs.
        for source_crop,crop in [('maize','corn'),('soybeans','soybeans')]:
            relative=f'data/cleanedPointSample/causalForestsOutput_{source_crop}_cates_covariables.csv'
            state_relative=f'data/cleanedPointSample/causalForestsOutput_{source_crop}_cates_byState.csv'
            source_hashes[relative]=hashlib.sha256(z.read(prefix+relative)).hexdigest()
            source_hashes[state_relative]=hashlib.sha256(z.read(prefix+state_relative)).hexdigest()
            reader=csv.DictReader(io.TextIOWrapper(z.open(prefix+relative),encoding='utf-8-sig'))
            reference=csv.DictReader(io.TextIOWrapper(z.open(prefix+state_relative),encoding='utf-8-sig'))
            reference_counts=Counter()
            for ref in reference:
                prediction=finite(ref['predictions'])
                error=abs(math.expm1(prediction)*100-finite(ref['tauPercents']))
                comparison_error=max(comparison_error,error)
                if error>1e-9:raise ValueError('Published percent-transform reference mismatch')
                reference_counts[(ref['state'],ref['year'],prediction)]+=1
            expected={'fips5','state','year','predictions','uniqueID','cropType'}
            if not expected.issubset(reader.fieldnames or []):raise ValueError('Published CSV is missing required fields')
            seen=set();n=0
            for r in reader:
                fips=r['fips5'];year=r['year'];state=r['state']
                if len(fips)!=5 or not fips.isdigit() or STATES.get(fips[:2])!=state or year not in ('2019','2020') or r['cropType']!=('corn' if crop=='corn' else 'soy'):
                    raise ValueError('Invalid county/crop/year in published estimate')
                key=(r['uniqueID'],year)
                if key in seen:raise ValueError('Duplicate model sample record')
                seen.add(key)
                prediction=finite(r['predictions'])
                effect=math.expm1(prediction)*100
                reference_key=(state,year,prediction)
                if reference_counts[reference_key]<1:raise ValueError('County CATE absent from published state reference')
                reference_counts[reference_key]-=1
                # Aggregate only county, crop, year and transformed estimate.
                # No identifiers or private sample locations leave this loop.
                groups[(fips,crop,year)].append(effect)
                groups[(fips,crop,'2019-2020')].append(effect)
                n+=1
            excluded_reference_counts[crop]=sum(reference_counts.values())
            counts[crop]=n
        if excluded_reference_counts!={'corn':96,'soybeans':125}:raise ValueError('Unexpected county-complete-case filtering')
        if counts!={'corn':45499,'soybeans':44110}:raise ValueError('Unexpected published sample coverage')
        estimates=defaultdict(list);suppressed=0;summary_records=0
        for (fips,crop,period),values in sorted(groups.items()):
            if len(values)<MIN_RECORDS:
                suppressed+=1
                continue
            summary_records+=1
            estimates[fips].append({'crop':crop,'period':period,'sampleRecords':len(values),'meanYieldEffectPct':round(fmean(values),6),'sampleRecordsByYear':{year:(len(groups.get((fips,crop,year),[])) if period in (year,'2019-2020') else 0) for year in ('2019','2020')}})
        stem='data/gis/tl_2021_us_county_YesGreatLakes_clip12'
        for extension in ('.shp','.shx','.dbf','.prj'):
            source_hashes[stem+extension]=hashlib.sha256(z.read(prefix+stem+extension)).hexdigest()
        crs=CRS.from_wkt(z.read(prefix+stem+'.prj').decode())
        transformer=Transformer.from_crs(crs,'EPSG:4326',always_xy=True)
        sf=shapefile.Reader(shp=io.BytesIO(z.read(prefix+stem+'.shp')),
            shx=io.BytesIO(z.read(prefix+stem+'.shx')),dbf=io.BytesIO(z.read(prefix+stem+'.dbf')))
        regions=[];matched=set();position_count=0;max_error=0.0
        for record in sf.iterShapeRecords():
            props=record.record.as_dict();fips=props['GEOID']
            if fips not in estimates:continue
            if fips in matched or props['STATEFP']!=fips[:2]:raise ValueError('Duplicate/incorrect county geometry')
            original=shape(record.shape.__geo_interface__)
            if original.is_empty or not original.is_valid:raise ValueError('Invalid source county geometry')
            geographic=transform(transformer.transform,original)
            if not geographic.is_valid:raise ValueError('Reprojection produced invalid geometry')
            # Approximately 300m angular tolerance; display only, not parcel/statistics.
            simple=set_precision(geographic.simplify(0.003,preserve_topology=True),1e-5,mode='valid_output')
            if simple.is_empty or not simple.is_valid or simple.geom_type not in ('Polygon','MultiPolygon'):
                raise ValueError('Invalid simplified county geometry')
            max_error=max(max_error,geographic.hausdorff_distance(simple))
            coordinates=get_coordinates(simple)
            if not all(math.isfinite(float(v)) for v in coordinates.flat):raise ValueError('Nonfinite geographic geometry')
            if coordinates[:,0].min() < -125 or coordinates[:,0].max()>-66 or coordinates[:,1].min()<24 or coordinates[:,1].max()>50:
                raise ValueError('Geography outside CONUS')
            position_count+=len(coordinates)
            centre=simple.representative_point()
            regions.append({'fips':fips,'name':props['NAME'],'state':STATES[fips[:2]],
                'centroid':[round(centre.x,5),round(centre.y,5)],'geometry':mapping(simple),'estimates':estimates[fips]})
            matched.add(fips)
        if matched!=set(estimates):raise ValueError('County estimate has no matching geometry')
    dataset={'status':'available','datasetId':'deines-2022-county-yield-effects-v1',
        'generatedAt':'2026-11-15T00:00:00Z',
        'message':'Historical county summaries of published corn and soybean yield-effect estimates, 2019–2020.',
        'source':{'title':'Deines et al. — cover crops and crop yields (published model outputs)',
            'url':'https://doi.org/10.5281/zenodo.7199708','doi':'10.1111/gcb.16489',
            'archiveSha256':ARCHIVE_SHA256,'license':'MIT (archived code/data release); original county geography from U.S. Census'},
        'method':{'summary':'Transform each authors’ published log-yield CATE with 100 × (exp(prediction) − 1), then take the arithmetic mean of model sample records within county, crop and period. No model is fitted or rerun.',
            'units':'percent','sampleUnit':'model sample record','minimumSampleRecords':MIN_RECORDS,
            'interpretation':'County mean of historical published cover-crop yield-effect estimates; positive means estimated yield gain. This post-publication summary is not a current field forecast, county-wide crop average, or independently validated county causal effect.',
            'limitations':['Research coverage: Iowa, Illinois, Indiana, Michigan, Missouri and Ohio; corn and soybeans only.',
                'The county-labelled complete-case exports omit 96 corn and 125 soybean records relative to state-only outputs; this summary uses the county-labelled subset.',
                'Analysis years are 2019 and 2020, independent of NASA imagery observation dates.',
                'Means weight sample records equally, not land area. Combined years weight their records, not years equally.',
                'Groups with fewer than 10 records are withheld; uncovered geography is not zero effect or zero acreage.',
                'Sample records may include repeated fields/years; counts are not independent farms or population acreage.',
                'County summaries have no newly computed confidence intervals or significance tests.',
                'No economic returns, regional root-zone saturation, active acreage or soil texture are inferred.',
                'County geometry is simplified for display; no private sample coordinates are ingested or exported.']},
        'regions':sorted(regions,key=lambda r:r['fips'])}
    # Shared Pydantic validation runs separately using API Python, so importer stays
    # isolated from application runtime dependencies.
    output=canonical(dataset)
    if len(output)>8_000_000:raise ValueError('Prepared regional payload too large')
    report={'datasetId':dataset['datasetId'],'archiveUrl':ARCHIVE_URL,'archiveMd5':ARCHIVE_MD5,
        'archiveSha256':ARCHIVE_SHA256,'preparedSha256':hashlib.sha256(output).hexdigest(),
        'sourceFileSha256':source_hashes,'sourceRecordsByCrop':counts,'stateOnlyRecordsExcludedByCountyExports':excluded_reference_counts,'countyCount':len(regions),
        'estimateCount':summary_records,'withheldSparseGroups':suppressed,
        'minSampleRecords':MIN_RECORDS,'maxPercentReferenceError':comparison_error,
        'geometryPositionCount':position_count,'geometrySimplificationToleranceDegrees':0.003,
        'maxGeometryHausdorffDistanceDegrees':max_error,
        'sourceCRSWkt':crs.to_wkt(),'outputCRS':'EPSG:4326',
        'validationScope':'archive and source integrity; published transform reproduction; county/state joins; finite bounded records; geographic topology; no raw point coordinates exported',
        'scientificScope':'post-publication county arithmetic summary of published estimates; no new model or county-level predictive validation',
        'privacy':'Only named CATE columns are read into aggregates. Raw point-sample files are never extracted. No sample IDs or locations are exported.'}
    return output,canonical(report)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--archive',type=Path,required=True)
    p.add_argument('--check',action='store_true')
    args=p.parse_args()
    try:
        output,report=prepare(args.archive)
        outputs={ROOT/'shared/data/regional-yield.json':output,ROOT/'apps/web/public/data/regional-yield.json':output,
            ROOT/'data/research/regional-yield-v1/validation.json':report}
        for path,body in outputs.items():
            if args.check:
                if not path.exists() or path.read_bytes()!=body:raise ValueError(f'Prepared output differs: {path}')
            else:
                path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(body)
        print('PASS', json.loads(report)['countyCount'],'counties;',json.loads(report)['estimateCount'],'estimates;',len(output),'bytes')
    except (ValueError,OSError,KeyError,TypeError,zipfile.BadZipFile) as e:p.exit(1,f'Regional preparation failed: {e}\n')

if __name__=='__main__':main()

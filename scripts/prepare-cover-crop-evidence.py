#!/usr/bin/env python3
"""Reproduce a source-locked research-site dataset; never create regional predictions."""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data/research/cover-crops/v1'
PAPER = 'https://doi.org/10.1002/ecs2.70397'
USDA = 'https://doi.org/10.15482/USDA.ADC/26836453.v1'
# SHA-256 locks the reviewed snapshots. USDA MD5s below are independently supplied
# by the repository API at https://api.figshare.com/v2/articles/26836453/versions/1.
SOURCES = {
    'CCS_ResponseCropYield.csv': ('58a888761483477e7859624d0324adf655f96cf5d8c1ac3cb8c89ce190647d1a', '91dbf1814e42f70ca346b9dea3867068', 'https://ndownloader.figshare.com/files/49752708'),
    'CCS_ResponseCropYield_Metadata.csv': ('97d87628d192d5151587cce23d880be3b46f80cf9d0404047cb5d2595b5f3f7a', '679ca746a8a5582cea95ff72968b8472', 'https://ndownloader.figshare.com/files/49752711'),
    'CCS_Treatments.csv': ('bd1f2d62e2e40c9aa8740335cbbdf6eea03f56594a0b8f9d57ed10ae471f72a8', '20b4f4b4ad0eaadd3d3ad59a595becb8', 'https://ndownloader.figshare.com/files/49752723'),
    'eash-2025-table2.csv': ('c2108aeef07d7dc6ab46c65d2ecb366b2688f87f5b0b5f5947abc05d2023727d', None, PAPER),
    'eash-2025-table4-no-forage.csv': ('932baaa2e3c084c8c4a49038ee9b61de472429dec857baa111556f5e76ecc81a', None, PAPER),
}
CROPS = {'SpringWheat': 'spring_wheat', 'Corn': 'corn', 'Soybean': 'soybeans', 'DryPea': 'dry_pea'}
LIMITS = [
    'Research-site evidence only; regional predictive validity is not established.',
    'Mandan observations and Colorado economic budgets are never joined across studies.',
    'No plot coordinates, regional active acreage, H3 assignments, or interpolated values are invented.',
    'USDA MOISTURE is grain moisture, not soil moisture or root-zone wetness.',
    'Colorado soil water storage is in mm, not a relative saturation fraction.',
    'Published Colorado partial budgets use historical inputs and two-year crop cycles; they are not current annual farm profit.',
    'Hypothetical forage-sale scenarios are excluded.',
    'Source NE/NA stay null; no imputation or machine-learning model is used.',
    'Descriptive contrasts do not establish statistical significance or external validity.',
]


def encoded(value):
    return (json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + '\n').encode()


def number(value, missing=False):
    if missing and value in ('NA', 'NE'):
        return None
    result = float(value)
    if not math.isfinite(result):
        raise ValueError('Non-finite source value')
    return result


def integer(value, allowed):
    if not value.isdigit() or int(value) not in allowed:
        raise ValueError(f'Invalid source integer: {value}')
    return int(value)


def rows(path, fields):
    with path.open(newline='', encoding='utf-8-sig') as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != fields:
            raise ValueError(f'Unexpected CSV columns: {path.name}')
        return list(reader)


def unique(records, key):
    keys = [key(r) for r in records]
    if len(keys) != len(set(keys)):
        raise ValueError('Duplicate source record or comparison')


def penalty(treatment, control):
    if treatment is None or control is None:
        return None
    if control <= 0:
        raise ValueError('Nonpositive control yield')
    return round(100 * (control - treatment) / control, 6)


def prepare(source: Path):
    files = []
    for name, (sha, md5, url) in SOURCES.items():
        path = source / name
        if path.stat().st_size > 2_000_000:
            raise ValueError('Source exceeds size limit')
        body = path.read_bytes()
        if hashlib.sha256(body).hexdigest() != sha:
            raise ValueError(f'Source checksum mismatch: {name}')
        if md5 and hashlib.md5(body).hexdigest() != md5:
            raise ValueError(f'Repository MD5 mismatch: {name}')
        files.append({'file': name, 'sha256': sha, 'repositoryMd5': md5, 'url': url,
                      'extraction': 'official CSV download' if md5 else 'manual numeric transcription from published table; source-reviewed'})

    treatments = rows(source / 'CCS_Treatments.csv', ['TREATMENT','CROPCODE','TREATMENTDESCIPTION','MONOCULTURE_MIXTURE'])
    treatment_map = {integer(r['TREATMENT'], range(1,21)): r['TREATMENTDESCIPTION'].strip() for r in treatments}
    if len(treatments) != 20 or set(treatment_map) != set(range(1,21)):
        raise ValueError('Incomplete treatment dictionary')
    raw = rows(source / 'CCS_ResponseCropYield.csv', ['YEAR','REP','PLOT','TRT','TRT_DESC','CROP','TESTWT','MOISTURE','TKW','YIELD'])
    if len(raw) != 944:
        raise ValueError('Unexpected pinned USDA snapshot row count')
    observations = []
    grouped = defaultdict(list)
    for line, r in enumerate(raw, 2):
        year = integer(r['YEAR'], range(2009,2012))
        rep = integer(r['REP'], range(1,5))
        trt = integer(r['TRT'], range(1,21))
        plot = integer(r['PLOT'], range(100,500))
        crop = CROPS[r['CROP']]
        yield_value, moisture = number(r['YIELD']), number(r['MOISTURE'])
        if yield_value < 0 or not 0 <= moisture <= 100:
            raise ValueError('Invalid yield or grain moisture')
        record = {'id': f'mandan-{year}-{crop}-{trt}-{rep}', 'studyId': 'mandan', 'year': year,
                  'crop': crop, 'replicate': rep, 'plot': plot, 'treatmentId': trt,
                  'treatmentLabel': treatment_map[trt], 'yieldKgHa': yield_value,
                  'grainMoisturePct': moisture, 'source': {'file':'CCS_ResponseCropYield.csv', 'row':line}}
        observations.append(record)
        grouped[(year,crop,trt)].append(record)
    unique(observations, lambda r: r['id'])
    unique(observations, lambda r: (r['year'],r['crop'],r['plot']))
    for group in grouped.values():
        if {r['replicate'] for r in group} != {1,2,3,4} or len(group) != 4:
            raise ValueError('Unbalanced replicate group')
    contrasts = []
    for (year,crop,trt), group in sorted(grouped.items()):
        if trt in (1,20):  # two controls are retained in observations, never treated as cover crops
            continue
        control = grouped.get((year,crop,1))
        if not control:
            raise ValueError('Missing matching control')
        control_by_rep = {r['replicate']:r for r in control}
        treatment_mean = mean(r['yieldKgHa'] for r in group)
        control_mean = mean(r['yieldKgHa'] for r in control)
        contrasts.append({'id': f'mandan-{year}-{crop}-{trt}', 'studyId':'mandan', 'year':year,
            'crop':crop, 'treatmentId':trt, 'controlTreatmentId':1, 'pairedReplicates':4,
            'treatmentMeanYieldKgHa':treatment_mean, 'controlMeanYieldKgHa':control_mean,
            'yieldPenaltyPct':penalty(treatment_mean, control_mean),
            'meanPairedYieldDifferenceKgHa':mean(r['yieldKgHa']-control_by_rep[r['replicate']]['yieldKgHa'] for r in group),
            'observationIds':[r['id'] for r in sorted(group, key=lambda r:r['replicate'])],
            'controlObservationIds':[r['id'] for r in sorted(control, key=lambda r:r['replicate'])]})
    if len(contrasts) != 216:
        raise ValueError('Unexpected treatment/control coverage')

    co = rows(source / 'eash-2025-table2.csv', ['trial','tillage','cycle','treatment','wheatYieldMgHa','soilWaterStorageMm'])
    if len(co) != 24:
        raise ValueError('Unexpected published Table 2 row count')
    site_means = []
    for line, r in enumerate(co, 2):
        trial, cycle = integer(r['trial'], (1,2)), integer(r['cycle'], (1,2,3))
        if r['tillage'] not in ('NT','CT') or r['treatment'] not in ('fall_cover','spring_cover','fallow'):
            raise ValueError('Unknown Colorado treatment')
        value, water = number(r['wheatYieldMgHa'], True), number(r['soilWaterStorageMm'])
        if (value is not None and value < 0) or water < 0:
            raise ValueError('Invalid published measurement')
        site_means.append({'id':f'colorado-{trial}-{r["tillage"]}-{cycle}-{r["treatment"]}',
            'studyId':'colorado', 'trial':trial, 'tillage':r['tillage'], 'cycle':cycle,
            'treatment':r['treatment'], 'crop':'winter_wheat', 'harvestYear':None,
            'yieldKgHa': None if value is None else round(value*1000,6),
            'yieldMissingReason':'not_evaluated' if value is None else None,
            'soilWaterStorageMm':water, 'source':{'file':'eash-2025-table2.csv','row':line,'table':2}})
    unique(site_means, lambda r:r['id'])
    lookup = {(r['trial'],r['tillage'],r['cycle'],r['treatment']):r for r in site_means}
    for r in site_means:
        if r['treatment']=='fallow': continue
        b = lookup[(r['trial'],r['tillage'],r['cycle'],'fallow')]
        contrasts.append({'id':r['id'],'studyId':'colorado','trial':r['trial'],'tillage':r['tillage'],
            'cycle':r['cycle'],'crop':'winter_wheat','treatment':r['treatment'],'baseline':'fallow',
            'treatmentMeanYieldKgHa':r['yieldKgHa'],'controlMeanYieldKgHa':b['yieldKgHa'],
            'yieldPenaltyPct':penalty(r['yieldKgHa'], b['yieldKgHa']),
            'pairedReplicates':None, 'observationIds':[r['id']], 'controlObservationIds':[b['id']]})

    raw_budgets = rows(source / 'eash-2025-table4-no-forage.csv', ['trial','tillage','treatment','averageCostUsdHaCycle','averageWheatRevenueUsdHaCycle','cycle1NetUsdHaCycle','cycle2NetUsdHaCycle','cycle3NetUsdHaCycle','meanNetUsdHaCycle'])
    if len(raw_budgets) != 8: raise ValueError('Unexpected Table 4 row count')
    budgets, checks, econ = [], [], []
    for line, r in enumerate(raw_budgets, 2):
        trial=integer(r['trial'], (1,2))
        values={k:number(v,True) for k,v in r.items() if k not in ('trial','tillage','treatment')}
        cycles=[values[f'cycle{i}NetUsdHaCycle'] for i in range(1,4)]
        available=[v for v in cycles if v is not None]
        budget={'id':f'colorado-budget-{trial}-{r["tillage"]}-{r["treatment"]}', 'studyId':'colorado',
                'trial':trial, 'tillage':r['tillage'], 'treatment':r['treatment'], 'crop':'winter_wheat',
                'unit':'USD/ha/2-year-cycle','basis':'published_partial_enterprise_budget',
                'includesForageSales':False, **values,
                'source':{'file':'eash-2025-table4-no-forage.csv','row':line,'table':4}}
        budgets.append(budget)
        # Preserve published means: rounded table values are not silently overwritten.
        for name, calculated in [('cycle_mean',mean(available)), ('revenue_minus_cost',values['averageWheatRevenueUsdHaCycle']-values['averageCostUsdHaCycle'])]:
            residual=round(values['meanNetUsdHaCycle']-calculated, 8)
            if abs(residual)>0.1: raise ValueError('Published budget arithmetic exceeds rounding tolerance')
            checks.append({'budgetId':budget['id'],'check':name,'residualUsdHaCycle':residual,'toleranceUsdHaCycle':0.1})
    unique(budgets, lambda r:r['id'])
    budget_controls={(r['trial'],r['tillage']):r for r in budgets if r['treatment']=='fallow'}
    for r in budgets:
        if r['treatment']=='fallow':continue
        b=budget_controls[(r['trial'],r['tillage'])]
        for period in ('cycle1','cycle2','cycle3','mean'):
            key=f'{period}NetUsdHaCycle'
            if r[key] is None or b[key] is None:continue
            econ.append({'id':r['id']+'-'+period,'studyId':'colorado','trial':r['trial'],
                'tillage':r['tillage'],'treatment':r['treatment'],'baseline':'fallow','crop':'winter_wheat',
                'aggregation':period,'unit':'USD/ha/2-year-cycle','deltaNetReturnUsdHaCycle':round(r[key]-b[key],6),
                'treatmentBudgetId':r['id'],'controlBudgetId':b['id'],'includesForageSales':False})
    unique(contrasts, lambda r:r['id'])
    unique(econ, lambda r:r['id'])
    if len(contrasts)!=231 or len(econ)!=16:raise ValueError('Unexpected prepared comparison count')
    dataset={'schemaVersion':1, 'datasetId':'cover-crop-research-evidence-v1', 'spatialScope':'research_sites',
        'regionalPredictiveValidity':'not_established','atlasRegionalCompatible':False,
        'sourceFiles':files, 'sources':[{'id':'mandan','url':USDA,'license':'CC0-1.0'},
            {'id':'colorado','url':PAPER,'dataDoi':'https://doi.org/10.5061/dryad.6t1g1jxb0',
             'license':'numeric facts transcribed from cited publication; article text not redistributed',
             'rawWorkbookAccess':'not_downloaded_HTTP_403_401'}],
        'sites':[{'studyId':'mandan','name':'USDA Area IV research farm, Mandan, ND',
            'declaredLocations': [[-100.9352,46.7801],[-100.9453,46.7762],[-100.9256,46.7576]],
            'locationMeaning':'Three source-listed research fields; not assigned to individual plots/years.',
            'responseYears':[2009,2010,2011],'exactPlotBoundaries':None},
            {'studyId':'colorado','name':'CSU Southwestern Colorado Research Center, Yellow Jacket, CO',
             'declaredLocations':[[-108.733333,37.533333]], 'locationPrecision':'one arcminute in publication',
             'locationMeaning':'Approximate study location; two adjacent trials, not a regional coverage polygon.',
             'exactHarvestDates':None,'exactPlotBoundaries':None}],
        'limitations':LIMITS,'plotObservations':observations,'publishedSiteMeans':site_means,
        'publishedBudgets':budgets,'yieldComparisons':contrasts,'economicComparisons':econ}
    output=encoded(dataset)
    report={'datasetId':dataset['datasetId'],'preparedSha256':hashlib.sha256(output).hexdigest(),
        'validationScope':'source integrity, schema/units, matching controls, arithmetic and missingness',
        'preparationChecks':'passed','regionalPredictiveValidation':'not_established',
        'counts':{'plotObservations':len(observations),'publishedSiteMeans':len(site_means),'publishedBudgets':len(budgets),
            'yieldComparisons':len(contrasts),'yieldComparisonsMissing':sum(r['yieldPenaltyPct'] is None for r in contrasts),
            'economicComparisons':len(econ),'disturbedControlObservationsRetained':sum(r['treatmentId']==20 for r in observations)},
        'budgetRoundingChecks':checks,'excludedFromPreparedMeasures':['USDA TESTWT (unit description requires review)','hypothetical forage-sale budgets'],
        'warnings':['USDA catalog temporal end precedes 2011 harvest; retain actual YEAR values, do not invent exact dates.',
            'Colorado repository description and final paper have different study-window descriptions; exact harvest dates withheld.',
            'Published mean budgets differ slightly from arithmetic on rounded inputs; residuals retained.',
            'Published statistical-letter groupings are not imported as per-comparison significance claims.'],
        'limitations':LIMITS}
    return output,encoded(report)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir',type=Path,default=DATA/'source')
    parser.add_argument('--output-dir',type=Path,default=DATA)
    parser.add_argument('--check',action='store_true',help='Check committed outputs without modifying them')
    args=parser.parse_args()
    try:
        outputs=prepare(args.source_dir)
        for name,body in zip(('prepared.json','validation.json'), outputs):
            path=args.output_dir/name
            if args.check:
                if not path.is_file() or path.read_bytes()!=body:raise ValueError(f'Output differs: {path}')
            else:
                path.parent.mkdir(parents=True,exist_ok=True)
                path.write_bytes(body)
        print('PASS: source-locked research evidence; regional predictive validity NOT established.')
        print(json.loads(outputs[1])['counts'])
    except (OSError,ValueError,KeyError,TypeError) as error:
        parser.exit(1,f'Preparation failed: {error}\n')

if __name__=='__main__':main()

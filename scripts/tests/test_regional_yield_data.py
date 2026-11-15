"""Independent checks on the shipped regional dataset and published source archive."""
import csv
import hashlib
import io
import json
import math
import os
import unittest
import zipfile
from collections import defaultdict
from pathlib import Path
from statistics import fmean

ROOT=Path(__file__).resolve().parents[2]


class RegionalYieldDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.path=ROOT/'shared/data/regional-yield.json'
        cls.body=cls.path.read_bytes()
        cls.data=json.loads(cls.body)
        cls.audit=json.loads((ROOT/'data/research/regional-yield-v1/validation.json').read_text())

    def test_web_and_api_use_identical_audited_source_data(self):
        self.assertEqual(self.body,(ROOT/'apps/web/public/data/regional-yield.json').read_bytes())
        self.assertEqual(hashlib.sha256(self.body).hexdigest(),self.audit['preparedSha256'])
        self.assertEqual(self.data['status'],'available')
        self.assertEqual(len(self.data['regions']),486)
        self.assertEqual(sum(len(r['estimates']) for r in self.data['regions']),2769)

    def test_privacy_geography_and_time_are_explicit(self):
        text=self.body.decode()
        for key in ('"latitude"','"longitude"','"uniqueID"','"lat_lon"','"yield_tha"','"netReturnUsdHa"'):
            self.assertNotIn(key,text)
        self.assertEqual({r['state'] for r in self.data['regions']},{'IA','IL','IN','MI','MO','OH'})
        self.assertEqual(len({r['fips'] for r in self.data['regions']}),486)
        for r in self.data['regions']:
            polygons=[r['geometry']['coordinates']] if r['geometry']['type']=='Polygon' else r['geometry']['coordinates']
            for polygon in polygons:
                for ring in polygon:
                    self.assertEqual(ring[0],ring[-1])
                    for x,y in ring:
                        self.assertTrue(-125<=x<=-66 and 24<=y<=50)

    def test_sample_threshold_year_counts_and_pooled_weighting(self):
        supported=defaultdict(int)
        for region in self.data['regions']:
            entries={(r['crop'],r['period']):r for r in region['estimates']}
            self.assertEqual(len(entries),len(region['estimates']))
            for e in entries.values():
                self.assertGreaterEqual(e['sampleRecords'],10)
                self.assertEqual(sum(e['sampleRecordsByYear'].values()),e['sampleRecords'])
                self.assertTrue(math.isfinite(e['meanYieldEffectPct']))
                if e['period']=='2019-2020':supported[e['crop']]+=1
            for crop in ('corn','soybeans'):
                if not all((crop,p) in entries for p in ('2019','2020','2019-2020')):continue
                a,b,p=(entries[(crop,p)] for p in ('2019','2020','2019-2020'))
                expected=(a['meanYieldEffectPct']*a['sampleRecords']+b['meanYieldEffectPct']*b['sampleRecords'])/(a['sampleRecords']+b['sampleRecords'])
                self.assertAlmostEqual(p['meanYieldEffectPct'],expected,places=5)
        self.assertEqual(dict(supported),{'corn':466,'soybeans':480})

    def test_independent_reaggregation_matches_every_shipped_county_estimate(self):
        archive=Path(os.environ.get('REGIONAL_YIELD_ARCHIVE','/tmp/deines-cover-crops-v1.zip'))
        if not archive.is_file():
            self.skipTest('Original archive optional in CI; use the documented checksum-verified source download to rerun.')
        body=archive.read_bytes()
        self.assertEqual(hashlib.md5(body).hexdigest(),'8bf24757d697d57f3e0087e8dd8e34bb')
        groups=defaultdict(list)
        with zipfile.ZipFile(io.BytesIO(body)) as z:
            prefix=z.namelist()[0].split('/')[0]+'/data/cleanedPointSample/'
            for source,crop in (('maize','corn'),('soybeans','soybeans')):
                # Only named county CATE output files; never raw sample coordinates.
                rows=csv.DictReader(io.TextIOWrapper(z.open(prefix+f'causalForestsOutput_{source}_cates_covariables.csv')))
                for row in rows:
                    effect=100*(math.exp(float(row['predictions']))-1)
                    groups[(row['fips5'],crop,row['year'])].append(effect)
                    groups[(row['fips5'],crop,'2019-2020')].append(effect)
        actual={(r['fips'],e['crop'],e['period']):e for r in self.data['regions'] for e in r['estimates']}
        expected={k:v for k,v in groups.items() if len(v)>=10}
        self.assertEqual(set(actual),set(expected))
        for key,values in expected.items():
            self.assertEqual(actual[key]['sampleRecords'],len(values))
            self.assertAlmostEqual(actual[key]['meanYieldEffectPct'],fmean(values),places=5)


if __name__=='__main__':unittest.main()

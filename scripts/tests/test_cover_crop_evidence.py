"""Independent regression checks for source-backed research preparation."""
import copy
import csv
import hashlib
import importlib.util
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('cover_crop_evidence', ROOT/'scripts/prepare-cover-crop-evidence.py')
prep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep)
DATA = ROOT/'data/research/cover-crops/v1'


class CoverCropEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.dataset_bytes, self.report_bytes = prep.prepare(DATA/'source')
        self.dataset = json.loads(self.dataset_bytes)
        self.report = json.loads(self.report_bytes)

    def test_outputs_reproduce_exactly_and_integrity_report_matches(self):
        self.assertEqual(self.dataset_bytes, (DATA/'prepared.json').read_bytes())
        self.assertEqual(self.report_bytes, (DATA/'validation.json').read_bytes())
        self.assertEqual(hashlib.sha256(self.dataset_bytes).hexdigest(), self.report['preparedSha256'])
        self.assertEqual(self.dataset['regionalPredictiveValidity'], 'not_established')
        self.assertFalse(self.dataset['atlasRegionalCompatible'])

    def test_all_usda_pairs_reconcile_to_raw_rows_without_treatment20(self):
        with (DATA/'source/CCS_ResponseCropYield.csv').open() as stream:
            raw = list(csv.DictReader(stream))
        for c in self.dataset['yieldComparisons']:
            if c['studyId'] != 'mandan': continue
            selected = [r for r in raw if int(r['YEAR'])==c['year'] and prep.CROPS[r['CROP']]==c['crop']]
            treatment = [float(r['YIELD']) for r in selected if int(r['TRT'])==c['treatmentId']]
            controls = [float(r['YIELD']) for r in selected if r['TRT']=='1']
            self.assertEqual((len(treatment), len(controls)), (4,4))
            self.assertNotIn(c['treatmentId'], (1,20))
            # Ratio of sums, independently calculated: equal replicate counts.
            expected = 100*(sum(controls)-sum(treatment))/sum(controls)
            self.assertAlmostEqual(c['yieldPenaltyPct'], expected, places=5)
        self.assertEqual(sum(r['treatmentId']==20 for r in self.dataset['plotObservations']),32)

    def test_published_units_missingness_and_gains_are_preserved(self):
        records = {r['id']:r for r in self.dataset['publishedSiteMeans']}
        self.assertEqual(records['colorado-1-NT-2-fall_cover']['yieldKgHa'],1520)
        self.assertEqual(records['colorado-1-NT-2-fall_cover']['soilWaterStorageMm'],123)
        self.assertEqual(sum(r['yieldKgHa'] is None for r in records.values()),6)
        comparisons = {r['id']:r for r in self.dataset['yieldComparisons']}
        self.assertAlmostEqual(comparisons['colorado-1-NT-2-fall_cover']['yieldPenaltyPct'], -12.592593)
        self.assertIsNone(comparisons['colorado-2-CT-3-fall_cover']['yieldPenaltyPct'])
        self.assertTrue(all(r['harvestYear'] is None for r in records.values()))

    def test_economics_uses_same_trial_tillage_baseline_and_cycle_units(self):
        budgets = {r['id']:r for r in self.dataset['publishedBudgets']}
        for c in self.dataset['economicComparisons']:
            treatment, control = budgets[c['treatmentBudgetId']], budgets[c['controlBudgetId']]
            self.assertEqual((treatment['trial'],treatment['tillage']),(control['trial'],control['tillage']))
            self.assertEqual(control['treatment'],'fallow')
            key = c['aggregation']+'NetUsdHaCycle'
            self.assertAlmostEqual(c['deltaNetReturnUsdHaCycle'], treatment[key]-control[key])
            self.assertEqual(c['unit'],'USD/ha/2-year-cycle')
            self.assertFalse(c['includesForageSales'])
        c = next(r for r in self.dataset['economicComparisons'] if r['id']=='colorado-budget-1-NT-fall_cover-mean')
        self.assertEqual(c['deltaNetReturnUsdHaCycle'],-184.01)
        self.assertEqual(len(self.dataset['economicComparisons']),16)
        self.assertLessEqual(max(abs(r['residualUsdHaCycle']) for r in self.report['budgetRoundingChecks']),0.1)

    def test_source_mutation_is_rejected_before_outputs_are_written(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)/'source'
            shutil.copytree(DATA/'source', source)
            with (source/'CCS_ResponseCropYield.csv').open('a') as stream: stream.write('\n')
            with self.assertRaisesRegex(ValueError,'checksum mismatch'):
                prep.prepare(source)

    def test_zero_control_is_rejected_even_after_new_snapshot_hash_is_reviewed(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)/'source'
            shutil.copytree(DATA/'source', source)
            path = source/'CCS_ResponseCropYield.csv'
            with path.open() as stream:
                reader=csv.DictReader(stream); columns=reader.fieldnames; raw=list(reader)
            for r in raw:
                if r['TRT']=='1':r['YIELD']='0'
            with path.open('w',newline='') as stream:
                writer=csv.DictWriter(stream,fieldnames=columns);writer.writeheader();writer.writerows(raw)
            body=path.read_bytes(); sources=copy.deepcopy(prep.SOURCES)
            sources[path.name]=(hashlib.sha256(body).hexdigest(),hashlib.md5(body).hexdigest(),sources[path.name][2])
            with patch.object(prep,'SOURCES',sources):
                with self.assertRaisesRegex(ValueError,'Nonpositive control yield'):
                    prep.prepare(source)


if __name__=='__main__':unittest.main()

import unittest

from ccass_hkex import classify, hk_stock_code, parse_rows, signal_for


SAMPLE = """
<tr>
<td class="col-participant-id"><div class="mobile-list-body">C00019</div></td>
<td class="col-participant-name"><div class="mobile-list-body">THE HONGKONG AND SHANGHAI BANKING</div></td>
<td class="col-shareholding text-right"><div class="mobile-list-body">1,000,000</div></td>
<td class="col-shareholding-percent text-right"><div class="mobile-list-body">32.81%</div></td>
</tr>
<tr>
<td class="col-participant-id"><div class="mobile-list-body">B01955</div></td>
<td class="col-participant-name"><div class="mobile-list-body">FUTU SECURITIES INTERNATIONAL</div></td>
<td class="col-shareholding text-right"><div class="mobile-list-body">100,000</div></td>
<td class="col-shareholding-percent text-right"><div class="mobile-list-body">0.61%</div></td>
</tr>
<tr>
<td class="col-participant-id"><div class="mobile-list-body">B00001</div></td>
<td class="col-participant-name"><div class="mobile-list-body">CITIC SECURITIES BROKERAGE</div></td>
<td class="col-shareholding text-right"><div class="mobile-list-body">50,000</div></td>
<td class="col-shareholding-percent text-right"><div class="mobile-list-body">0.10%</div></td>
</tr>
"""


class CcassTests(unittest.TestCase):
    def test_codes(self):
        self.assertEqual(hk_stock_code("9988.HK"), "09988")
        self.assertEqual(hk_stock_code("0700.HK"), "00700")

    def test_buckets(self):
        self.assertEqual(classify("CITIBANK N.A."), "institutional")
        self.assertEqual(classify("FUTU SECURITIES INTERNATIONAL"), "retail")
        self.assertEqual(classify("CITIC SECURITIES BROKERAGE"), "other")

    def test_parse_and_signal(self):
        rows = parse_rows(SAMPLE)
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0].bucket, "institutional")
        self.assertEqual(rows[1].bucket, "retail")
        self.assertEqual(signal_for(45.2, 12.1, 43.0, 13.4), "INSTITUTIONAL_ACCUMULATION")
        self.assertEqual(signal_for(40.0, 15.0, 42.0, 12.0), "RETAIL_TRAP")


if __name__ == "__main__":
    unittest.main()

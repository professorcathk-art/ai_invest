import unittest

from ccass_hkex import classify, hidden_inputs, hk_stock_code, parse_rows, signal_for


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

    def test_shards_split_the_watchlist(self):
        from sync_ccass import apply_market, apply_shard

        hk = apply_market(["0700.HK", "NVDA", "0005.HK", "AAPL", "9988.HK"], "hk")
        self.assertEqual(hk, ["0700.HK", "0005.HK", "9988.HK"])
        self.assertEqual(apply_shard(hk, "1/3"), ["0700.HK"])
        self.assertEqual(apply_shard(hk, "2/3"), ["0005.HK"])
        self.assertEqual(apply_shard(hk, "3/3"), ["9988.HK"])

    def test_hidden_aspnet_fields(self):
        html = """
        <form>
          <input type="hidden" name="__VIEWSTATE" value="abc" />
          <input type="hidden" name="txtShareholdingDate" value="2026/09/07" />
          <input type="submit" name="btnSearch" value="Search" />
        </form>
        """
        fields = hidden_inputs(html)
        self.assertEqual(fields["__VIEWSTATE"], "abc")
        self.assertEqual(fields["txtShareholdingDate"], "2026/09/07")


if __name__ == "__main__":
    unittest.main()

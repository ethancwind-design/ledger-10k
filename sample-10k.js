/* =============================================================================
   SAMPLE 10-K DATA  —  Helios Materials, Inc. (fictional)
   -----------------------------------------------------------------------------
   A condensed but internally-consistent Form 10-K for demo purposes. The three
   financial statements tie:
     • Income Statement  -> Net income 158,300 (FY2025)
     • Cash Flow         -> begins at Net income 158,300; net change +63,500
     • Balance Sheet     -> cash 248,900 -> 312,400 (matches CF net change)
     • Balance Sheet balances (Assets = Liabilities + Equity)
   All dollar figures in thousands unless noted. Replace this object with a real
   filing (e.g. parsed from SEC EDGAR) without touching app logic — the app only
   needs: { company, sections: [{ id, item, title, html }] }.
   ========================================================================== */

const SAMPLE_10K = {
  company: "Helios Materials, Inc.",
  ticker: "HLMX",
  form: "Form 10-K",
  fiscalYear: "Fiscal year ended December 31, 2025",
  sections: [
    {
      id: "cover",
      item: "Cover",
      title: "Cover Page",
      html: `
        <p class="doc-center"><strong>UNITED STATES SECURITIES AND EXCHANGE COMMISSION</strong><br>Washington, D.C. 20549</p>
        <p class="doc-center"><strong>FORM 10-K</strong></p>
        <p class="doc-center">ANNUAL REPORT PURSUANT TO SECTION 13 OR 15(d) OF THE SECURITIES EXCHANGE ACT OF 1934<br>For the fiscal year ended December 31, 2025</p>
        <p class="doc-center"><strong>HELIOS MATERIALS, INC.</strong><br>(Exact name of registrant as specified in its charter)</p>
        <p>Delaware &nbsp;|&nbsp; Commission File No. 001-39842 &nbsp;|&nbsp; IRS Employer I.D. No. 84-2210045</p>
        <p>Common stock, par value $0.001 per share, trading under the symbol <strong>HLMX</strong> on the New York Stock Exchange. As of June 30, 2025, the aggregate market value of common stock held by non-affiliates was approximately $4.9 billion. As of February 14, 2026, there were 83,640,210 shares of common stock outstanding.</p>
      `
    },
    {
      id: "item1",
      item: "Item 1",
      title: "Business",
      html: `
        <h3>Overview</h3>
        <p>Helios Materials, Inc. (&ldquo;Helios,&rdquo; the &ldquo;Company,&rdquo; &ldquo;we,&rdquo; or &ldquo;our&rdquo;) is a specialty materials company that develops, manufactures, and sells engineered coatings and precision industrial components. Founded in 1998 and headquartered in Columbus, Ohio, we serve customers in the aerospace, semiconductor, automotive, energy, and medical-device end markets across more than 40 countries. We operate 14 manufacturing facilities and employ approximately 7,200 people worldwide.</p>
        <p>We manage our business through two reportable segments: <strong>Advanced Coatings</strong> and <strong>Industrial Components</strong>. In the fiscal year ended December&nbsp;31, 2025, these segments generated net revenue of $1,104.4&nbsp;million and $737.9&nbsp;million, respectively.</p>
        <h3>Advanced Coatings</h3>
        <p>The Advanced Coatings segment produces proprietary thin-film and thermal-barrier coatings applied to turbine blades, semiconductor capital equipment, and medical implants. Approximately 68% of segment revenue in 2025 was recurring, derived from long-term supply agreements with original-equipment manufacturers. The segment&rsquo;s coatings are qualified into customer production lines through multi-year certification processes that create meaningful switching costs.</p>
        <h3>Industrial Components</h3>
        <p>The Industrial Components segment manufactures precision-machined and additively-manufactured components, including sealing systems, fluid-control assemblies, and structural fasteners. Demand in this segment is more cyclical and is correlated with industrial capital-expenditure cycles. The segment competes on engineering capability, lead time, and total cost of ownership.</p>
        <h3>Customers and Concentration</h3>
        <p>Our ten largest customers accounted for approximately 41% of consolidated net revenue in 2025. One customer in the Advanced Coatings segment represented 12% of consolidated net revenue. No other customer exceeded 10%.</p>
        <h3>Backlog</h3>
        <p>Consolidated backlog was $1,318.0&nbsp;million as of December&nbsp;31, 2025, compared with $1,142.0&nbsp;million as of December&nbsp;31, 2024. We expect to recognize approximately 74% of year-end backlog as revenue during 2026.</p>
        <h3>Human Capital</h3>
        <p>As of December&nbsp;31, 2025, we employed approximately 7,200 full-time employees, of whom approximately 4,400 were engaged in manufacturing and operations and approximately 950 in research and development.</p>
        <h3>Raw Materials</h3>
        <p>Our principal raw materials include cobalt, nickel, tantalum, specialty polymers, and rare-earth oxides. Prices for several of these inputs are volatile and, in some cases, sourced from a limited number of suppliers concentrated in specific geographies.</p>
      `
    },
    {
      id: "item1a",
      item: "Item 1A",
      title: "Risk Factors",
      html: `
        <p class="doc-italic">The following is a summary of certain material risks. This section is abridged for demonstration purposes.</p>
        <h3>Demand for our Industrial Components products is cyclical.</h3>
        <p>A significant portion of Industrial Components revenue depends on industrial capital-expenditure cycles. A downturn in our customers&rsquo; end markets has in the past reduced, and could in the future reduce, order volumes, pricing, and capacity utilization, adversely affecting revenue and gross margin.</p>
        <h3>We depend on a limited number of suppliers for certain raw materials.</h3>
        <p>Cobalt, tantalum, and certain rare-earth oxides are sourced from a small number of suppliers in concentrated geographies. Supply disruption, export controls, or price spikes could increase cost of revenue and compress gross margin, which was 39.0% in 2025.</p>
        <h3>Customer concentration could adversely affect results.</h3>
        <p>Our ten largest customers represented approximately 41% of net revenue in 2025, and one customer represented 12%. The loss of, or a material reduction in orders from, a significant customer could have a material adverse effect on our results of operations.</p>
        <h3>We have substantial indebtedness.</h3>
        <p>As of December&nbsp;31, 2025, we had $662.4&nbsp;million of total debt outstanding, including $400.0&nbsp;million of senior notes and $262.4&nbsp;million under our term loan. Our debt agreements contain financial covenants, including a maximum net-leverage ratio, that could limit our operating flexibility.</p>
        <h3>A portion of our revenue is denominated in foreign currencies.</h3>
        <p>Approximately 34% of 2025 net revenue was generated outside the United States. Fluctuations in foreign-currency exchange rates have affected, and may continue to affect, reported revenue and operating results; in 2025 we recognized a $7.0&nbsp;million foreign-currency translation loss in other comprehensive income.</p>
      `
    },
    {
      id: "item7",
      item: "Item 7",
      title: "Management's Discussion and Analysis (MD&A)",
      html: `
        <h3>Results of Operations &mdash; Year Ended December 31, 2025 Compared with 2024</h3>
        <p><strong>Net revenue</strong> increased $187.4&nbsp;million, or 11.3%, to $1,842.3&nbsp;million in 2025 from $1,654.9&nbsp;million in 2024. The increase was driven by 8.2% organic volume growth in Advanced Coatings, favorable pricing of approximately 2.4%, partially offset by a 0.9% unfavorable foreign-currency impact. Advanced Coatings revenue grew 14.1% to $1,104.4&nbsp;million, while Industrial Components revenue grew 7.5% to $737.9&nbsp;million.</p>
        <p><strong>Cost of revenue</strong> was $1,123.8&nbsp;million in 2025, or 61.0% of net revenue, compared with $1,032.7&nbsp;million, or 62.4% of net revenue, in 2024. <strong>Gross profit</strong> increased to $718.5&nbsp;million, and gross margin expanded 140 basis points to 39.0%, primarily reflecting operating leverage on higher volumes and favorable mix toward higher-margin coatings, partially offset by higher cobalt and tantalum input costs.</p>
        <p><strong>Research and development</strong> expense was $142.6&nbsp;million (7.7% of revenue) in 2025, compared with $128.3&nbsp;million (7.8%) in 2024. <strong>Selling, general and administrative</strong> expense was $318.9&nbsp;million (17.3% of revenue), compared with $295.4&nbsp;million (17.9%) in 2024, reflecting disciplined cost control as revenue grew.</p>
        <p>During 2025 we recorded a <strong>restructuring charge of $24.8&nbsp;million</strong> related to the consolidation of two Industrial Components facilities and associated workforce reductions of approximately 240 positions. We did not record restructuring charges in 2024. We expect annualized run-rate savings of approximately $18&nbsp;million beginning in the second half of 2026. <span class="doc-flag">This charge is non-recurring and should be normalized when modeling sustainable operating margin.</span></p>
        <p><strong>Operating income</strong> was $232.2&nbsp;million in 2025, compared with $198.5&nbsp;million in 2024. Excluding the restructuring charge, adjusted operating income was $257.0&nbsp;million, or 13.9% of net revenue.</p>
        <p><strong>Interest expense</strong> decreased to $38.4&nbsp;million from $41.2&nbsp;million as we repaid $41.5&nbsp;million of term-loan principal. <strong>Interest and other income</strong> was $9.1&nbsp;million, compared with $6.3&nbsp;million, reflecting higher yields on invested cash.</p>
        <p>Our <strong>effective tax rate</strong> was 22.0% in both 2025 and 2024. The rate exceeded the 21% U.S. statutory rate primarily due to state income taxes and foreign earnings taxed at higher rates, partially offset by the federal research credit and excess tax benefits on stock-based compensation.</p>
        <p><strong>Net income</strong> was $158.3&nbsp;million, or $1.88 per diluted share, in 2025, compared with $127.6&nbsp;million, or $1.49 per diluted share, in 2024. Diluted weighted-average shares outstanding were 84.2&nbsp;million in 2025 and 85.6&nbsp;million in 2024.</p>
        <h3>Liquidity and Capital Resources</h3>
        <p>As of December&nbsp;31, 2025, we had $312.4&nbsp;million of cash and cash equivalents and $84.2&nbsp;million of short-term investments. We also had $300.0&nbsp;million of undrawn capacity under our revolving credit facility.</p>
        <p><strong>Operating cash flow</strong> was $297.3&nbsp;million in 2025, compared with $260.1&nbsp;million in 2024, driven by higher net income and a $48.6&nbsp;million non-cash stock-based compensation add-back, partially offset by a $19.4&nbsp;million net investment in working capital. <strong>Capital expenditures</strong> were $156.4&nbsp;million (8.5% of revenue), compared with $138.7&nbsp;million in 2024, as we expanded coatings capacity. We define free cash flow as operating cash flow less capital expenditures; free cash flow was $140.9&nbsp;million in 2025.</p>
        <p>During 2025 we repaid $41.5&nbsp;million of debt, paid $21.3&nbsp;million of dividends, and repurchased $6.2&nbsp;million of common stock. Total debt was $662.4&nbsp;million at year-end, and our net-leverage ratio (net debt to adjusted EBITDA) was approximately 0.7x.</p>
        <h3>Critical Accounting Estimates</h3>
        <p>Our critical accounting estimates include revenue recognition on over-time contracts, goodwill impairment, inventory valuation, and income taxes. Goodwill of $488.1&nbsp;million is tested annually for impairment; no impairment was recorded in 2025.</p>
      `
    },
    {
      id: "income-statement",
      item: "Item 8",
      title: "Consolidated Statements of Operations",
      html: `
        <p class="doc-italic">In thousands, except per-share data. Year ended December 31,</p>
        <table class="fin">
          <thead><tr><th>&nbsp;</th><th>2025</th><th>2024</th><th>2023</th></tr></thead>
          <tbody>
            <tr><td>Net revenue</td><td>1,842,300</td><td>1,654,900</td><td>1,520,100</td></tr>
            <tr><td>Cost of revenue</td><td>1,123,800</td><td>1,032,700</td><td>968,400</td></tr>
            <tr class="subtotal"><td>Gross profit</td><td>718,500</td><td>622,200</td><td>551,700</td></tr>
            <tr><td>Research and development</td><td>142,600</td><td>128,300</td><td>119,800</td></tr>
            <tr><td>Selling, general and administrative</td><td>318,900</td><td>295,400</td><td>274,100</td></tr>
            <tr><td>Restructuring charges</td><td>24,800</td><td>&mdash;</td><td>12,300</td></tr>
            <tr class="subtotal"><td>Operating income</td><td>232,200</td><td>198,500</td><td>145,500</td></tr>
            <tr><td>Interest expense</td><td>(38,400)</td><td>(41,200)</td><td>(44,700)</td></tr>
            <tr><td>Interest and other income, net</td><td>9,100</td><td>6,300</td><td>4,200</td></tr>
            <tr class="subtotal"><td>Income before income taxes</td><td>202,900</td><td>163,600</td><td>105,000</td></tr>
            <tr><td>Provision for income taxes</td><td>44,600</td><td>36,000</td><td>23,100</td></tr>
            <tr class="total"><td>Net income</td><td>158,300</td><td>127,600</td><td>81,900</td></tr>
            <tr><td>Diluted earnings per share</td><td>1.88</td><td>1.49</td><td>0.94</td></tr>
            <tr><td>Diluted weighted-average shares</td><td>84,200</td><td>85,600</td><td>86,900</td></tr>
          </tbody>
        </table>
      `
    },
    {
      id: "balance-sheet",
      item: "Item 8",
      title: "Consolidated Balance Sheets",
      html: `
        <p class="doc-italic">In thousands. As of December 31,</p>
        <table class="fin">
          <thead><tr><th>&nbsp;</th><th>2025</th><th>2024</th></tr></thead>
          <tbody>
            <tr class="hdr"><td colspan="3">Assets</td></tr>
            <tr><td>Cash and cash equivalents</td><td>312,400</td><td>248,900</td></tr>
            <tr><td>Short-term investments</td><td>84,200</td><td>61,500</td></tr>
            <tr><td>Accounts receivable, net</td><td>268,700</td><td>241,300</td></tr>
            <tr><td>Inventories</td><td>224,600</td><td>208,400</td></tr>
            <tr><td>Prepaid expenses and other current assets</td><td>41,900</td><td>38,200</td></tr>
            <tr class="subtotal"><td>Total current assets</td><td>931,800</td><td>798,300</td></tr>
            <tr><td>Property, plant and equipment, net</td><td>642,300</td><td>598,700</td></tr>
            <tr><td>Goodwill</td><td>488,100</td><td>488,100</td></tr>
            <tr><td>Intangible assets, net</td><td>156,400</td><td>174,900</td></tr>
            <tr><td>Deferred tax assets</td><td>38,700</td><td>42,100</td></tr>
            <tr><td>Other non-current assets</td><td>52,800</td><td>48,600</td></tr>
            <tr class="total"><td>Total assets</td><td>2,310,100</td><td>2,150,700</td></tr>
            <tr class="hdr"><td colspan="3">Liabilities and Stockholders' Equity</td></tr>
            <tr><td>Accounts payable</td><td>142,300</td><td>131,800</td></tr>
            <tr><td>Accrued liabilities</td><td>118,600</td><td>109,400</td></tr>
            <tr><td>Current portion of long-term debt</td><td>50,000</td><td>45,000</td></tr>
            <tr><td>Deferred revenue</td><td>36,200</td><td>31,700</td></tr>
            <tr class="subtotal"><td>Total current liabilities</td><td>347,100</td><td>317,900</td></tr>
            <tr><td>Long-term debt</td><td>612,400</td><td>658,900</td></tr>
            <tr><td>Deferred tax liabilities</td><td>64,800</td><td>71,200</td></tr>
            <tr><td>Other non-current liabilities</td><td>88,700</td><td>92,300</td></tr>
            <tr class="subtotal"><td>Total liabilities</td><td>1,113,000</td><td>1,140,300</td></tr>
            <tr><td>Common stock and additional paid-in capital</td><td>724,800</td><td>667,600</td></tr>
            <tr><td>Retained earnings</td><td>493,500</td><td>356,500</td></tr>
            <tr><td>Accumulated other comprehensive loss</td><td>(21,200)</td><td>(14,200)</td></tr>
            <tr class="subtotal"><td>Total stockholders' equity</td><td>1,197,100</td><td>1,010,400</td></tr>
            <tr class="total"><td>Total liabilities and stockholders' equity</td><td>2,310,100</td><td>2,150,700</td></tr>
          </tbody>
        </table>
      `
    },
    {
      id: "cash-flow",
      item: "Item 8",
      title: "Consolidated Statements of Cash Flows",
      html: `
        <p class="doc-italic">In thousands. Year ended December 31,</p>
        <table class="fin">
          <thead><tr><th>&nbsp;</th><th>2025</th><th>2024</th></tr></thead>
          <tbody>
            <tr class="hdr"><td colspan="3">Operating activities</td></tr>
            <tr><td>Net income</td><td>158,300</td><td>127,600</td></tr>
            <tr><td>Depreciation and amortization</td><td>112,800</td><td>104,300</td></tr>
            <tr><td>Stock-based compensation</td><td>48,600</td><td>43,200</td></tr>
            <tr><td>Deferred income taxes</td><td>(3,000)</td><td>(2,400)</td></tr>
            <tr><td>Changes in accounts receivable</td><td>(27,400)</td><td>(18,900)</td></tr>
            <tr><td>Changes in inventories</td><td>(16,200)</td><td>(12,100)</td></tr>
            <tr><td>Changes in accounts payable and accrued liabilities</td><td>19,700</td><td>14,600</td></tr>
            <tr><td>Changes in deferred revenue</td><td>4,500</td><td>3,800</td></tr>
            <tr class="subtotal"><td>Net cash provided by operating activities</td><td>297,300</td><td>260,100</td></tr>
            <tr class="hdr"><td colspan="3">Investing activities</td></tr>
            <tr><td>Capital expenditures</td><td>(156,400)</td><td>(138,700)</td></tr>
            <tr><td>Purchases of short-term investments, net</td><td>(22,700)</td><td>(15,300)</td></tr>
            <tr><td>Acquisitions, net of cash acquired</td><td>&mdash;</td><td>(84,200)</td></tr>
            <tr class="subtotal"><td>Net cash used in investing activities</td><td>(179,100)</td><td>(238,200)</td></tr>
            <tr class="hdr"><td colspan="3">Financing activities</td></tr>
            <tr><td>Repayments of long-term debt</td><td>(41,500)</td><td>(42,000)</td></tr>
            <tr><td>Dividends paid</td><td>(21,300)</td><td>(19,800)</td></tr>
            <tr><td>Repurchases of common stock</td><td>(6,200)</td><td>(68,300)</td></tr>
            <tr><td>Proceeds from employee stock plans</td><td>14,300</td><td>12,800</td></tr>
            <tr class="subtotal"><td>Net cash used in financing activities</td><td>(54,700)</td><td>(117,300)</td></tr>
            <tr class="total"><td>Net increase (decrease) in cash</td><td>63,500</td><td>(95,400)</td></tr>
            <tr><td>Cash and equivalents, beginning of year</td><td>248,900</td><td>344,300</td></tr>
            <tr class="total"><td>Cash and equivalents, end of year</td><td>312,400</td><td>248,900</td></tr>
          </tbody>
        </table>
      `
    },
    {
      id: "note-segments",
      item: "Item 8 — Note 14",
      title: "Note 14 — Segment Information",
      html: `
        <p>We have two reportable segments: Advanced Coatings and Industrial Components. The Chief Operating Decision Maker evaluates segment performance based on segment operating income, which excludes corporate expenses and restructuring charges.</p>
        <p class="doc-italic">In thousands. Year ended December 31,</p>
        <table class="fin">
          <thead><tr><th>Net revenue</th><th>2025</th><th>2024</th></tr></thead>
          <tbody>
            <tr><td>Advanced Coatings</td><td>1,104,400</td><td>968,200</td></tr>
            <tr><td>Industrial Components</td><td>737,900</td><td>686,700</td></tr>
            <tr class="total"><td>Total net revenue</td><td>1,842,300</td><td>1,654,900</td></tr>
          </tbody>
        </table>
        <table class="fin">
          <thead><tr><th>Segment operating income</th><th>2025</th><th>2024</th></tr></thead>
          <tbody>
            <tr><td>Advanced Coatings</td><td>178,900</td><td>151,400</td></tr>
            <tr><td>Industrial Components</td><td>78,100</td><td>72,100</td></tr>
            <tr class="subtotal"><td>Total segment operating income</td><td>257,000</td><td>223,500</td></tr>
            <tr><td>Corporate and unallocated</td><td>(25,000)</td><td>(25,000)</td></tr>
            <tr><td>Restructuring charges</td><td>(24,800)</td><td>&mdash;</td></tr>
            <tr><td>Other corporate items</td><td>24,800</td><td>&mdash;</td></tr>
            <tr class="total"><td>Consolidated operating income</td><td>232,200</td><td>198,500</td></tr>
          </tbody>
        </table>
        <p class="doc-italic">Geographic revenue: United States $1,215,900; International $626,400 (34% of total) for 2025.</p>
      `
    },
    {
      id: "note-debt",
      item: "Item 8 — Note 9",
      title: "Note 9 — Debt",
      html: `
        <p class="doc-italic">In thousands. As of December 31,</p>
        <table class="fin">
          <thead><tr><th>&nbsp;</th><th>2025</th><th>2024</th></tr></thead>
          <tbody>
            <tr><td>4.25% Senior Notes due 2029</td><td>400,000</td><td>400,000</td></tr>
            <tr><td>Term Loan A (SOFR + 1.50%), due 2028</td><td>262,400</td><td>303,900</td></tr>
            <tr><td>Revolving credit facility ($300,000 capacity)</td><td>&mdash;</td><td>&mdash;</td></tr>
            <tr class="subtotal"><td>Total debt</td><td>662,400</td><td>703,900</td></tr>
            <tr><td>Less: current portion</td><td>(50,000)</td><td>(45,000)</td></tr>
            <tr class="total"><td>Long-term debt</td><td>612,400</td><td>658,900</td></tr>
          </tbody>
        </table>
        <p>The Senior Notes bear interest at a fixed annual rate of 4.25%, payable semi-annually. The Term Loan A amortizes in quarterly installments and bears interest at SOFR plus a margin of 1.50%. Our credit agreement requires us to maintain a maximum net-leverage ratio of 3.50x and a minimum interest-coverage ratio of 3.00x. We were in compliance with all covenants as of December&nbsp;31, 2025. Aggregate maturities of debt are: 2026 &mdash; $50,000; 2027 &mdash; $55,000; 2028 &mdash; $157,400; 2029 &mdash; $400,000.</p>
      `
    },
    {
      id: "note-sbc",
      item: "Item 8 — Note 11",
      title: "Note 11 — Stock-Based Compensation",
      html: `
        <p>We recognized stock-based compensation expense of $48.6&nbsp;million, $43.2&nbsp;million, and $39.1&nbsp;million for 2025, 2024, and 2023, respectively. Expense is allocated approximately 30% to cost of revenue, 25% to research and development, and 45% to selling, general and administrative expense.</p>
        <p>As of December&nbsp;31, 2025, total unrecognized compensation cost related to unvested awards was $96.4&nbsp;million, expected to be recognized over a weighted-average period of 2.4 years. Restricted stock units outstanding totaled 3,180 thousand, and performance stock units totaled 1,240 thousand at target. <span class="doc-flag">Stock-based compensation is a non-cash expense added back in the cash flow statement; modelers often scrutinize whether it should be treated as a real economic cost.</span></p>
      `
    },
    {
      id: "note-tax",
      item: "Item 8 — Note 12",
      title: "Note 12 — Income Taxes",
      html: `
        <p class="doc-italic">Effective tax rate reconciliation.</p>
        <table class="fin">
          <thead><tr><th>&nbsp;</th><th>2025</th><th>2024</th></tr></thead>
          <tbody>
            <tr><td>U.S. federal statutory rate</td><td>21.0%</td><td>21.0%</td></tr>
            <tr><td>State income taxes, net of federal benefit</td><td>2.1%</td><td>2.0%</td></tr>
            <tr><td>Foreign rate differential</td><td>1.4%</td><td>1.5%</td></tr>
            <tr><td>Federal research credit</td><td>(1.6%)</td><td>(1.5%)</td></tr>
            <tr><td>Excess tax benefit on stock-based compensation</td><td>(0.8%)</td><td>(0.9%)</td></tr>
            <tr><td>Other, net</td><td>(0.1%)</td><td>(0.1%)</td></tr>
            <tr class="total"><td>Effective tax rate</td><td>22.0%</td><td>22.0%</td></tr>
          </tbody>
        </table>
        <p>The provision for income taxes was $44.6&nbsp;million in 2025. As of December&nbsp;31, 2025, we had net deferred tax liabilities of $26.1&nbsp;million and federal net operating loss carryforwards of $18.3&nbsp;million expiring between 2034 and 2041.</p>
      `
    }
  ]
};

if (typeof window !== "undefined") { window.SAMPLE_10K = SAMPLE_10K; }
if (typeof module !== "undefined" && module.exports) { module.exports = SAMPLE_10K; }

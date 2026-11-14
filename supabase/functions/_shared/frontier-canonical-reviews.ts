// Optional add-on; never changes the baseline twelve or default Prop bundle.
export const FRONTIER_CANONICAL_REVIEWS=[
  {
    "schema": "canonical-account-review/v1",
    "strategyId": "gold.frontier-compression-15-24-1.5-5-h96",
    "periods": [
      {
        "reportSha256": "2f36ec74b508b5eb316b78db34f2d94db72525b788a86be9183609a46fcf44b3",
        "engineSourceSha256": "766500bb9c9a94f4545e41849887f75af211582ad8b858f5b7c7356afc5ab458",
        "status": "COMPLETED",
        "strategyIds": [
          "gold.frontier-compression-15-24-1.5-5-h96"
        ],
        "start": "2026-05-05T00:00:00.000Z",
        "end": "2026-07-01T00:00:00.000Z",
        "metrics": {
          "closedTrades": 24,
          "openPositions": 1,
          "authorizedEntries": 25,
          "rejectedAttempts": 0,
          "rejectionReasons": {},
          "winRate": 0.25,
          "profitFactor": 1.1374643717496788,
          "expectancyR": 0.10220963465974209,
          "realizedNet": 281.66182615001134,
          "endingBalance": 25279.698955850025,
          "endingEquity": 25266.114955850026,
          "netReturnPct": 1.0644598234001024,
          "maximumDrawdownPct": 4.8601206347168135,
          "drawdownDefinition": "Conservative OHLC intrabar equity bound, not an observed tick path",
          "maxLosingStreak": 8,
          "costs": 17.1675,
          "financing": 52.10354415,
          "tradesPerDay": 0.43859649122807015,
          "tradesPerWeek": 3.070175438596491,
          "accountFailed": false,
          "sharpe": null,
          "sortino": null,
          "riskOfRuin": null,
          "qualification": "NOT_GRANTED",
          "limitations": [
            "Short/correlated samples do not establish risk of ruin or statistical confidence",
            "Unclosed positions remain marked, not counted as completed wins"
          ]
        },
        "capital": 25000,
        "riskPct": 0.5
      },
      {
        "reportSha256": "46c0a054a6ffe177bc37547c5864eb7c3b85b0ec27b082ce03285f3cff32110e",
        "engineSourceSha256": "766500bb9c9a94f4545e41849887f75af211582ad8b858f5b7c7356afc5ab458",
        "status": "COMPLETED",
        "strategyIds": [
          "gold.frontier-compression-15-24-1.5-5-h96"
        ],
        "start": "2026-07-01T00:00:00.000Z",
        "end": "2026-11-01T00:00:00.000Z",
        "metrics": {
          "closedTrades": 59,
          "openPositions": 0,
          "authorizedEntries": 59,
          "rejectedAttempts": 0,
          "rejectionReasons": {},
          "winRate": 0.23728813559322035,
          "profitFactor": 1.0581259518068074,
          "expectancyR": 0.049394609950978004,
          "realizedNet": 318.5909974999761,
          "endingBalance": 25318.59099749999,
          "endingEquity": 25318.59099749999,
          "netReturnPct": 1.2743639899999544,
          "maximumDrawdownPct": 5.194747310274094,
          "drawdownDefinition": "Conservative OHLC intrabar equity bound, not an observed tick path",
          "maxLosingStreak": 9,
          "costs": 52.08000000000002,
          "financing": 148.76900250000003,
          "tradesPerDay": 0.4796747967479675,
          "tradesPerWeek": 3.3577235772357725,
          "accountFailed": false,
          "sharpe": null,
          "sortino": null,
          "riskOfRuin": null,
          "qualification": "NOT_GRANTED",
          "limitations": [
            "Short/correlated samples do not establish risk of ruin or statistical confidence",
            "Unclosed positions remain marked, not counted as completed wins"
          ]
        },
        "capital": 25000,
        "riskPct": 0.5
      }
    ],
    "limitations": [
      "Signal and forward demo scope only. No live authorization.",
      "Retrospective May\u2013June / July\u2013October partitions. A May\u2013July production-parity comparison lost 1.52%; it is retained in the research report.",
      "The November 1\u201312 comparison has six closed trades and is a partial fresh observation, not a monthly return or independent success probability.",
      "Native ordered-quote research and the shared OHLC account replay use different timing and lifecycle admission. Their returns are shown separately.",
      "One full-position 5R target, up to 24-hour holding; commission, financing, slippage and contract rules remain scenarios.",
      "New configuration is optional. The existing twelve-strategy bundle and seven-strategy Prop default are unchanged."
    ]
  }
] as const;

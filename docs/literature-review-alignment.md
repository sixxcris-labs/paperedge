# PaperEdge Alignment Review: Sports Betting Academic Literature Survey

## Introduction
This document reviews the provided comprehensive survey *"The Mathematics of Sports Betting: A Survey of the Academic Literature"* in the context of PaperEdge's goals as a verification-first paper-trading workspace for sports betting opportunities. It identifies alignments, gaps, and actionable recommendations to better align the tool (and any associated agents or features) with evidence-based best practices from the literature.

## Project Context
PaperEdge enables manual logging of paper trades from imported opportunities (e.g., OddsJam-style scanners), manual verification on books, locking trades, settlement after events, performance analysis, and mistake journaling. Emphasis on discipline, verification, and learning without any automation or real betting.

## Strong Alignments
- **Building Discipline Against Biases**: Perfectly aligns with Levitt (2004) on bookmakers exploiting bettor biases, Haghani-Dewey (2017) experiment showing poor sizing even with +EV, and behavioral findings (favorite overbetting, hot hand, sentiment). The paper trading + mistakes log helps users internalize these and avoid common pitfalls.
- **Opportunity Tracking and Journaling**: Supports arbitrage (+EV) tracking and post-analysis, consistent with Kaunitz et al. (2017) odds aggregation and general efficiency studies.
- **Risk Awareness**: Manual verification enforces carefulness, mirroring the need for fractional Kelly due to estimation error.

## Key Misalignments / Focus Areas to Improve Alignment
1. **Prioritize Closing Line Value (CLV) Tracking**
   - **Literature Insight**: CLV is the gold-standard for long-term profitability (Sauer 1998, Buchdahl/Pinnacle tradition). If you consistently beat the closing no-vig line, you have edge. Short-term P&L is too variance-heavy.
   - **Current Gap**: Tool focuses on P&L and exposure but lacks explicit CLV.
   - **Recommendation**: Add UI fields/data model for recording opening and closing lines (from sharp books). Compute and display CLV metrics on dashboard. Make it the primary performance KPI.

2. **Integrate Bankroll Management (Fractional Kelly)**
   - **Literature Insight**: Full Kelly is brittle; fractional (≤1/2) drastically reduces drawdown risk with small growth sacrifice (Thorp, Benter 1994, Jacot & Mochkovitch 2023).
   - **Current Gap**: Bankroll tracking exists but no sizing guidance.
   - **Recommendation**: Add Kelly calculator in trade workflow. Log intended stake % and recommended fractional size. Simulate scenarios.

3. **Target Sport-Specific and Proven Inefficiencies**
   - Focus on: NFL key numbers (3,7) and (historical) Wong teasers; NBA favorite shading and high totals; Soccer Poisson/Dixon-Coles models; general favorite-longshot (with vig caveat).
   - **Recommendation**: Add trade categorization by market type. Analytics broken down by sport/bias. Agents could assist in applying models (e.g., suggest Poisson probs).

4. **Uncorrelated Edges and Model Support**
   - **Literature**: Profit from models uncorrelated with bookies (Hubáček 2019) or aggregation (Kaunitz).
   - **Recommendation**: Future agents/features for independent probability estimation, consensus odds vs. book comparison.

5. **Arbitrage Realism and Warnings**
   - Arbs rare/shrinking (Vlastakis 2009); accounts limited.
   - Add educational notes and focus UI/analytics more on value betting.

## Recommended Feature Enhancements / Roadmap
- **Immediate**: CLV fields, Kelly calc, enhanced mistake categories based on lit (e.g., 'overbet favorite', 'recency bias').
- **Next**: Sport-specific dashboards, basic model integrations or references.
- **Advanced**: AI agents for opportunity evaluation, literature synthesis, backtesting support.

## Conclusion and Benefits
Aligning PaperEdge more closely with these findings will make it not just a tracker, but a comprehensive coaching system for developing scalable, literature-backed betting skills. Users will learn to focus on durable principles like CLV and proper sizing rather than chasing transient scanner edges.

This positions PaperEdge as superior to generic paper trading tools.

*Generated from review of the attached survey literature. Key papers: Levitt 2004, Dixon-Coles 1997, Snowberg-Wolfers 2010, etc.*

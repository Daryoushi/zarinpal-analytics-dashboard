import json
import os
from typing import Dict, List, Any, Optional
from backend.models import (
    MerchantProfile, MerchantDirectoryItem, SimulationRequest,
    SimulationResponse, ActionableInsight
)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

# In-memory fast stores
_MERCHANTS_DATA: Dict[str, Any] = {}
_MERCHANT_DIRECTORY: List[Dict[str, Any]] = []
_CATEGORY_BENCHMARKS: Dict[int, Any] = {}

def initialize_engine():
    global _MERCHANTS_DATA, _MERCHANT_DIRECTORY, _CATEGORY_BENCHMARKS
    
    with open(os.path.join(DATA_DIR, "merchants_data.json"), "r", encoding="utf-8") as f:
        _MERCHANTS_DATA = json.load(f)
        
    with open(os.path.join(DATA_DIR, "merchant_directory.json"), "r", encoding="utf-8") as f:
        _MERCHANT_DIRECTORY = json.load(f)
        
    with open(os.path.join(DATA_DIR, "category_benchmarks.json"), "r", encoding="utf-8") as f:
        raw_bms = json.load(f)
        _CATEGORY_BENCHMARKS = {int(k): v for k, v in raw_bms.items()}
        
    print(f"Analytics Engine loaded: {len(_MERCHANTS_DATA)} merchants, {len(_CATEGORY_BENCHMARKS)} categories.")

def get_merchant_profile(merchant_key: str) -> Optional[Dict[str, Any]]:
    return _MERCHANTS_DATA.get(merchant_key)

def get_all_merchants_directory(
    category_id: Optional[int] = None,
    volume_tier: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100
) -> List[Dict[str, Any]]:
    results = _MERCHANT_DIRECTORY
    
    if category_id is not None:
        results = [m for m in results if m["category_id"] == category_id]
        
    if volume_tier:
        results = [m for m in results if m["volume_tier"] == volume_tier]
        
    if search:
        search_clean = search.strip().lower()
        results = [
            m for m in results
            if search_clean in m["merchant_key"].lower() or search_clean in m["category_title"].lower()
        ]
        
    return results[:limit]

def get_category_benchmark(category_id: int) -> Optional[Dict[str, Any]]:
    return _CATEGORY_BENCHMARKS.get(category_id)

def get_all_category_benchmarks() -> Dict[int, Any]:
    return _CATEGORY_BENCHMARKS

def simulate_growth(req: SimulationRequest) -> SimulationResponse:
    merchant = _MERCHANTS_DATA.get(req.merchant_key)
    if not merchant:
        raise ValueError(f"Merchant {req.merchant_key} not found")
        
    summary = merchant["summary"]
    eff = merchant["effort_funnel"]
    ret = merchant["retention_details"]
    
    curr_6m_vol = summary["total_volume"]
    curr_annual_vol = curr_6m_vol * 2  # Annualized
    avg_ticket = max(1, summary["avg_ticket"])
    
    # 1. Retry recovery lever
    # Failed sessions in bank * retry boost pct
    bank_fails = eff.get("bank_fail_cnt", 0)
    recovered_txs = int(bank_fails * (req.retry_recovery_boost_pct / 100.0))
    recovered_vol_6m = recovered_txs * avg_ticket
    recovered_vol_annual = recovered_vol_6m * 2
    
    # 2. Retention lever
    # One-time customers converted * LTV gap
    one_time_cust = ret.get("one_time_customers", 0)
    retained_cust = int(one_time_cust * (req.repeat_rate_boost_pct / 100.0))
    ltv_gap = max(avg_ticket, (ret.get("avg_repeat_ltv", 0) - ret.get("avg_onetime_ltv", 0)))
    retention_vol_6m = retained_cust * ltv_gap
    retention_vol_annual = retention_vol_6m * 2
    
    # 3. Bounce reduction lever
    # Bounce sessions recovered * conversion rate * ticket
    bounce_sessions = eff.get("bounce_zero_try_cnt", 0)
    cr = max(0.20, summary["conversion_rate"] / 100.0)
    bounce_recovered_txs = int(bounce_sessions * (req.bounce_reduction_pct / 100.0) * cr)
    bounce_vol_6m = bounce_recovered_txs * avg_ticket
    bounce_vol_annual = bounce_vol_6m * 2
    
    net_incremental_annual = recovered_vol_annual + retention_vol_annual + bounce_vol_annual
    projected_annual = curr_annual_vol + net_incremental_annual
    growth_pct = (net_incremental_annual / max(1, curr_annual_vol)) * 100.0
    
    return SimulationResponse(
        merchant_key=req.merchant_key,
        current_annual_volume=curr_annual_vol,
        projected_annual_volume=projected_annual,
        net_incremental_revenue=net_incremental_annual,
        growth_percentage=round(growth_pct, 2),
        breakdown={
            "psp_retry_recovery_annual": recovered_vol_annual,
            "customer_retention_annual": retention_vol_annual,
            "bounce_mitigation_annual": bounce_vol_annual
        },
        explanation=(
            f"با اعمال بهبودهای درخواستی، تخمین زده می‌شود درآمد سالانه شما از "
            f"{curr_annual_vol/1e6:,.1f} میلیون تومان به {projected_annual/1e6:,.1f} میلیون تومان "
            f"({growth_pct:+.1f}٪ رشد) برسد."
        )
    )

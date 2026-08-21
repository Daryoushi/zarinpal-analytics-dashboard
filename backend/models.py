from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class MerchantSummary(BaseModel):
    total_volume: int
    paid_transactions: int
    total_sessions: int
    conversion_rate: float
    avg_ticket: int
    median_ticket: int
    avg_init_ms: float
    avg_verify_ms: float
    unique_customers: int
    repeat_rate_pct: float

class PercentileRanks(BaseModel):
    conversion_rate_rank: float
    volume_rank: float
    ticket_rank: float

class StatisticalBasis(BaseModel):
    test: Optional[str] = None
    sample_size: Optional[int] = None
    chi2_stat: Optional[float] = None
    p_value: Optional[str] = None
    selection_bias_control: Optional[str] = None
    repeat_rate: Optional[str] = None
    repeat_to_onetime_ltv_ratio: Optional[str] = None
    category_shift_baseline: Optional[str] = None
    merchant_mar_vol: Optional[int] = None
    merchant_apr_vol: Optional[int] = None
    status: Optional[str] = None
    note: Optional[str] = None
    category_median_bounce: Optional[str] = None

class ActionableInsight(BaseModel):
    id: str
    type: str
    priority: str
    title: str
    metric_display: str
    metric_label: str
    action_statement: str
    statistical_basis: StatisticalBasis
    formula: str
    formula_values: Dict[str, Any]
    lineage_filter: str

class SwitchError(BaseModel):
    code: str
    description: str
    count: int

class MerchantProfile(BaseModel):
    merchant_key: str
    primary_terminal: str
    category_id: int
    category_title: str
    volume_tier: str
    volume_tier_fa: str
    retention_segment: str
    retention_segment_fa: str
    friction_segment: str
    friction_segment_fa: str
    is_sample_sufficient: bool
    summary: MerchantSummary
    percentile_ranks: PercentileRanks
    effort_funnel: Dict[str, Any]
    retention_details: Dict[str, Any]
    top_errors: List[SwitchError]
    monthly_trend: List[Dict[str, Any]]
    day_of_week: List[Dict[str, Any]]
    hourly_distribution: List[Dict[str, Any]]
    insights: List[ActionableInsight]
    sample_lineage_rows: List[Dict[str, Any]]

class MerchantDirectoryItem(BaseModel):
    merchant_key: str
    category_id: int
    category_title: str
    volume_tier: str
    volume_tier_fa: str
    total_volume: int
    conversion_rate: float
    paid_transactions: int
    is_sample_sufficient: bool

class SimulationRequest(BaseModel):
    merchant_key: str
    retry_recovery_boost_pct: float = Field(default=0.0, description="Additional % recovery on retry attempts (0-30%)")
    repeat_rate_boost_pct: float = Field(default=0.0, description="Additional % repeat customers (0-20%)")
    bounce_reduction_pct: float = Field(default=0.0, description="Reduction in gateway zero-try bounce (0-50%)")

class SimulationResponse(BaseModel):
    merchant_key: str
    current_annual_volume: int
    projected_annual_volume: int
    net_incremental_revenue: int
    growth_percentage: float
    breakdown: Dict[str, int]
    explanation: str

class ChatMessage(BaseModel):
    role: str
    content: str

class AIChatRequest(BaseModel):
    merchant_key: str
    question: str
    chat_history: Optional[List[ChatMessage]] = []

class AIChatResponse(BaseModel):
    answer: str
    cited_insights: List[str]
    suggested_actions: List[str]
    confidence: str

import os
import json
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from backend.engine import (
    initialize_engine, get_merchant_profile, get_all_merchants_directory,
    get_category_benchmark, get_all_category_benchmarks, simulate_growth
)
from backend.models import (
    MerchantProfile, MerchantDirectoryItem, SimulationRequest,
    SimulationResponse, AIChatRequest, AIChatResponse
)
from backend.ai_agent import process_merchant_chat

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Load engine and caches into memory
    initialize_engine()
    yield

app = FastAPI(
    title="ZarinPal Merchant Analytics & Intelligence API",
    description="سیستم تحلیلی و بینش‌پژوهی پذیرندگان زرین‌پال مبتنی بر داده‌های تراکنش واقعی",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware for local frontend dev or embed
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API Endpoints ---

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "zarinpal-analytics-engine"}

@app.get("/api/merchants", response_model=List[MerchantDirectoryItem])
async def list_merchants(
    category_id: Optional[int] = Query(None, description="شناسه صنف"),
    volume_tier: Optional[str] = Query(None, description="سطح حجم: MEGA, GROWTH, MID, EMERGING"),
    search: Optional[str] = Query(None, description="جستجوی نام یا کلید پذیرنده"),
    limit: int = Query(100, description="تعداد نتایج")
):
    """لیست و جستجوی پذیرندگان با فیلترهای صنف و سطح تراکنش"""
    return get_all_merchants_directory(
        category_id=category_id,
        volume_tier=volume_tier,
        search=search,
        limit=limit
    )

@app.get("/api/merchants/{merchant_key}", response_model=MerchantProfile)
async def get_merchant(merchant_key: str):
    """دریافت پروفایل کامل تحلیلی، بینش‌های اقدام‌پذیر و نمونه ردیف‌های خام پذیرنده"""
    profile = get_merchant_profile(merchant_key)
    if not profile:
        raise HTTPException(status_code=404, detail=f"پذیرنده با شناسه {merchant_key} یافت نشد.")
    return profile

@app.get("/api/benchmarks")
async def get_benchmarks():
    """دریافت مقادیر صدک و شاخص‌های پایه برای تمامی اصناف"""
    return get_all_category_benchmarks()

@app.get("/api/benchmarks/{category_id}")
async def get_single_benchmark(category_id: int):
    """دریافت مقادیر صدک و بنچ‌مارک یک صنف مشخص"""
    bm = get_category_benchmark(category_id)
    if not bm:
        raise HTTPException(status_code=404, detail="صنف مورد نظر یافت نشد.")
    return bm

@app.post("/api/simulate", response_model=SimulationResponse)
async def run_revenue_simulation(req: SimulationRequest):
    """شبیه‌سازی تعاملی تاثیر بهبود تلاش مجدد، وفاداری مشتری و کاهش پرش بر درآمد سالانه"""
    try:
        return simulate_growth(req)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.post("/api/chat", response_model=AIChatResponse)
async def chat_with_ai(req: AIChatRequest):
    """دستیار هوشمند پذیرنده با تضمین ایزولاسیون و ارجاع مستقیم به بینش‌های محاسبه‌شده"""
    return process_merchant_chat(req)

@app.get("/api/eda-stats")
async def get_eda_stats():
    """دریافت خلاصه کاوش اولیه داده‌ها و توزیع کلی شبکه"""
    eda_file = os.path.join(os.path.dirname(__file__), "..", "docs", "eda_stats.json")
    if os.path.exists(eda_file):
        with open(eda_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"message": "EDA stats file not found"}

# --- Serve Static Frontend ---
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
async def serve_frontend():
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "ZarinPal Analytics Dashboard API is running. Frontend static files will be mounted at /"}

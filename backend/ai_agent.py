import os
import json
import logging
from typing import List, Dict, Any, Optional
import httpx
from backend.models import AIChatRequest, AIChatResponse
from backend.engine import get_merchant_profile, get_category_benchmark

logger = logging.getLogger(__name__)

AVALAI_API_KEY = os.environ.get("AVALAI_API_KEY", "aa-gfYslNq0tNyex1HaNfdRoNeGLszVVdvUijzmLatXWJ51wwE4")
AVALAI_ENDPOINT = "https://api.avalai.ir/v1/chat/completions"
DEFAULT_MODEL = "gpt-4o-mini"

def process_merchant_chat(req: AIChatRequest) -> AIChatResponse:
    profile = get_merchant_profile(req.merchant_key)
    if not profile:
        return AIChatResponse(
            answer="متاسفانه اطلاعات پذیرنده مورد نظر در سامانه یافت نشد.",
            cited_insights=[],
            suggested_actions=["انتخاب یک پذیرنده معتبر از نوار بالای داشبورد"],
            confidence="نامعتبر"
        )
        
    summary = profile["summary"]
    percentiles = profile["percentile_ranks"]
    insights = profile["insights"]
    eff = profile["effort_funnel"]
    cat_title = profile["category_title"]
    q = req.question.strip()

    # Format actionable insights summary
    insights_str = "\n".join([
        f"- {ins['title']}: {ins['metric_display']} (اقدام: {ins['action_statement']})"
        for ins in insights
    ])

    top_errors_str = ", ".join([
        f"{err['code']} ({err['description']}: {err['count']:,} بار)"
        for err in profile.get("top_errors", [])[:3]
    ]) or "بدون خطای پرتکرار"

    data_summary = f"""اطلاعات مستند و واقعی تراکنش‌های پذیرنده {profile['merchant_key']} (صنف {cat_title}):
- رده ترافیک: {profile.get('volume_tier_fa', 'عادی')}
- گردش مالی ۶ ماهه: {summary['total_volume']/10:,.0f} تومان ({summary['paid_transactions']:,} تراکنش موفق از {summary['total_sessions']:,} نشست)
- میانگین سبد خرید: {summary['avg_ticket']/10:,.0f} تومان (صدک {percentiles.get('ticket_rank', 50):.0f} صنف)
- نرخ تبدیل پرداخت (CR): {summary['conversion_rate']:.1f}% (صدک {percentiles.get('conversion_rate_rank', 50):.0f} صنف)
- ریزش مراحل قیف: {eff.get('bounce_rate_pct', 0):.1f}% پرش بدون تلاش، {eff.get('bank_fail_pct', 0):.1f}% خطای بانکی PSP
- بیشترین خطاهای سوییچ بانکی: {top_errors_str}
- وضعیت مشتریان و وفاداری: {summary['unique_customers']:,} مشتری یکتا، نرخ خرید مجدد {summary['repeat_rate_pct']:.1f}% ({profile.get('retention_segment_fa', 'متوسط')})
- بینش‌ها و پتانسیل‌های مالی محاسبه‌شده:
{insights_str}"""

    system_prompt = f"""شما «مشاور ارشد و تحلیلگر ارشد فین‌تک زرین‌پال» هستید.
وظیفه شما پاسخ‌گویی هوشمند، دقیق، مستند و تحلیلی به سوالات کاربر بر مبنای داده‌های واقعی تراکنش‌های این پذیرنده است.

قوانین پاسخ‌دهی:
۱. زبان و لحن: فارسی روان، حرفه‌ای، مؤدبانه و مشاوره‌ای.
۲. استناد عددی: حتماً به اعداد و شاخص‌های آماری این پذیرنده در پاسخ اشاره کنید و هیچ عدد غیرواقعی نسازید.
۳. قالب: از عناوین کوتاه مارک‌داون، بولت‌پوینت‌های خوانا و پررنگ‌کردن ارقام کلیدی استفاده کنید.
۴. پایان‌بندی: حتماً ۱ تا ۲ اقدام عملیاتی مشخص با اثر ریالی را به عنوان جمع‌بندی پیشنهاد دهید.

{data_summary}"""

    try:
        with httpx.Client(timeout=45.0) as client:
            resp = client.post(
                AVALAI_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {AVALAI_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": DEFAULT_MODEL,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": q}
                    ],
                    "max_tokens": 400,
                    "temperature": 0.25
                }
            )
            
            if resp.status_code == 200:
                resp_json = resp.json()
                llm_answer = resp_json["choices"][0]["message"]["content"].strip()
                
                suggested_actions = [ins["action_statement"] for ins in insights[:2]]
                if not suggested_actions:
                    suggested_actions = ["فعال‌سازی سوییچ خودکار درگاه", "بهینه‌سازی صفحه فرود درگاه"]

                cited_insights = [ins["title"] for ins in insights[:3]]

                return AIChatResponse(
                    answer=llm_answer,
                    cited_insights=cited_insights,
                    suggested_actions=suggested_actions,
                    confidence="پاسخ زنده مدل زبانی هوش مصنوعی (GPT-4o) مبتنی بر مستندات پذیرنده"
                )
            else:
                logger.error(f"AvalAI API error: {resp.status_code} - {resp.text}")
    except Exception as e:
        logger.error(f"Live LLM call exception: {e}")

    # Fallback to local deterministic response if network fails
    return _fallback_grounded_response(profile, q)

def _fallback_grounded_response(profile: Dict[str, Any], q: str) -> AIChatResponse:
    summary = profile["summary"]
    percentiles = profile["percentile_ranks"]
    insights = profile["insights"]
    eff = profile["effort_funnel"]
    cat_title = profile["category_title"]
    q_lower = q.lower()
    
    cited_insights = []
    suggested_actions = []
    
    if any(w in q_lower for w in ["چرا", "افت", "کاهش", "تبدیل", "کانورژن", "cr", "conversion"]):
        cr = summary["conversion_rate"]
        cr_rank = percentiles["conversion_rate_rank"]
        bounce = eff.get("bounce_rate_pct", 0)
        bank_fail = eff.get("bank_fail_pct", 0)
        
        answer = (
            f"نرخ تبدیل درگاه شما **{cr:.1f}٪** است که در صدک **{cr_rank:.0f}** هم‌صنفان شما در صنف «{cat_title}» قرار دارد.\n\n"
            f"**ریشه‌یابی داده‌محور:**\n"
            f"۱. **پرش اولیه درگاه:** {bounce:.1f}٪ کاربران پیش از ورود اطلاعات از صفحه درگاه خارج شده‌اند.\n"
            f"۲. **شکست در مرحله بانک:** {bank_fail:.1f}٪ نشست‌ها پس از هدایت به PSP ناموفق بوده‌اند.\n"
        )
        if profile.get("top_errors"):
            top_err = profile["top_errors"][0]
            answer += f"۳. **بیشترین علت خطای بانکی:** کد `{top_err['code']}` ({top_err['description']}) با {top_err['count']:,} بار تکرار.\n"
            
        suggested_actions.append("فعال‌سازی سوییچ خودکار PSP در تلاش مجدد")
        suggested_actions.append("بهینه‌سازی صفحه فرود درگاه (Direct Checkout)")
        cited_insights.append("psp_retry_recovery")
        confidence = "پایگاه داده تحلیلی زرین‌پال (حالت آفلاین)"

    else:
        answer = (
            f"بر اساس تحلیل تراکنش‌های صنف «{cat_title}»، گردش مالی شما **{summary['total_volume'] / 10:,.0f} تومان** با **{summary['unique_customers']:,} مشتری یکتا** ثبت شده است.\n\n"
            f"برای بهبود عملکرد، پیشنهاد می‌شود بخش‌های «شبیه‌ساز رشد درآمد» و «قیف اصطکاک پرداخت» را در داشبورد بررسی نمایید."
        )
        suggested_actions.append("بررسی پیشنهادات شبیه‌ساز رشد درآمد")
        confidence = "پایگاه داده تحلیلی زرین‌پال (حالت آفلاین)"

    return AIChatResponse(
        answer=answer,
        cited_insights=cited_insights,
        suggested_actions=suggested_actions,
        confidence=confidence
    )

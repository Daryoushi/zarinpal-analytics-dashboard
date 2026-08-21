import httpx
import uvicorn
import threading
import time
import sys
from backend.main import app

sys.stdout.reconfigure(encoding='utf-8')

def test_full_application():
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=8002, log_level="warning"))
    t = threading.Thread(target=server.run, daemon=True)
    t.start()
    time.sleep(1.5)

    with httpx.Client(base_url="http://127.0.0.1:8002", timeout=30.0) as client:
        print("1. Testing Root Route (GET /)...")
        r = client.get("/")
        assert r.status_code == 200, f"Root failed: {r.status_code}"
        assert "داشبورد تحلیلی و بینش‌پژوهی زرین‌پال" in r.text
        print("  -> Root HTML served successfully with correct Persian title.")

        print("2. Testing Static Assets...")
        r_css = client.get("/static/css/style.css")
        assert r_css.status_code == 200
        r_js = client.get("/static/js/app.js")
        assert r_js.status_code == 200
        print("  -> style.css & app.js served successfully.")

        print("3. Testing Archetype Merchants...")
        archetypes = ["M156", "M31", "M18", "M250", "M27", "M89"]
        for m_key in archetypes:
            r = client.get(f"/api/merchants/{m_key}")
            assert r.status_code == 200, f"Failed for {m_key}: {r.status_code}"
            data = r.json()
            print(f"  -> Merchant {m_key}: Category='{data['category_title']}', Volume Tier='{data['volume_tier']}', Sample Sufficient={data['is_sample_sufficient']}, Insights Count={len(data['insights'])}")

        print("4. Testing AI Chat for Archetype M31 (Education with bank failure)...")
        chat_r = client.post("/api/chat", json={
            "merchant_key": "M31",
            "question": "علت افت تراکنش‌های من چیه؟"
        })
        assert chat_r.status_code == 200
        chat_data = chat_r.json()
        print(f"  -> AI Answer for M31:\n{chat_data['answer']}\n")

        print("5. Testing Simulator on M18...")
        sim_r = client.post("/api/simulate", json={
            "merchant_key": "M18",
            "retry_recovery_boost_pct": 12.0,
            "repeat_rate_boost_pct": 8.0,
            "bounce_reduction_pct": 20.0
        })
        assert sim_r.status_code == 200
        sim_data = sim_r.json()
        print(f"  -> Simulation Growth for M18: {sim_data['growth_percentage']:+.1f}% | Net Incremental: {sim_data['net_incremental_revenue']:,} Tomans")

    print("\n✅ ALL END-TO-END VERIFICATION CHECKS PASSED WITH FLYING COLORS! 🚀")

if __name__ == "__main__":
    test_full_application()

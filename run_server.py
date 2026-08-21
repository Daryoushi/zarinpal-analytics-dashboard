import uvicorn
import sys
import os

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding='utf-8')
    print("=" * 60)
    print("  🚀 ZarinPal Merchant Analytics & Intelligence Dashboard")
    print("  🌐 Server running at: http://127.0.0.1:8000")
    print("  📚 API Docs (Swagger): http://127.0.0.1:8000/docs")
    print("=" * 60)
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)

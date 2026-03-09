"""
YBG13™ Aegis Plus v1.5 - Python
"The Guard" Edition
"""
import logging
import re
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

# Log Yapılandırması
logging.basicConfig(filename='aegis_threats.log', level=logging.WARNING, 
                    format='%(asctime)s - %(levelname)s - %(message)s')

class AegisPlusShield(BaseHTTPMiddleware):
    def __init__(self, app, allowed_extensions=None):
        super().__init__(app)
        self.allowed_extensions = allowed_extensions or [".jpg", ".png", ".pdf"]
        self.patterns = {
            "SQLi": r"(union\s+select|select\s+.*\s+from|insert\s+into)",
            "XSS": r"(<script>|javascript:|onerror=)",
            "PathTraversal": r"(\.\.\/|\/etc\/passwd)"
        }

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host

        # 1. URL VE PARAMETRE TARAMASI 
        query_params = str(request.query_params).lower()
        for attack_type, pattern in self.patterns.items():
            if re.search(pattern, query_params):
                logging.warning(f"IP: {client_ip} | Type: {attack_type} | Data: {query_params}")
                return JSONResponse(status_code=403, 
                                    content={"error": f"Aegis Plus: {attack_type} Tespit Edildi!"})

        # 2. DOSYA UZANTISI DENETİMİ (Plus Özelliği)
        if "multipart/form-data" in request.headers.get("content-type", ""):
            path_str = request.url.path.lower()
            # Basit bir kontrol: URL içinde geçersiz uzantı araması (Geliştirilebilir)
            if any(path_str.endswith(ext) for ext in [".php", ".exe", ".sh"]):
                logging.critical(f"IP: {client_ip} | Attempted malicious file upload")
                return JSONResponse(status_code=400, content={"error": "Yasaklı dosya tipi!"})

        response = await call_next(request)
        response.headers["X-Aegis-Security"] = "Plus-Enabled"
        return response
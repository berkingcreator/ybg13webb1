import re
import time
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

class AegisAdvancedShield(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        # Gelişmiş Tehdit Kütüphanesi
        self.patterns = {
            "SQLi": r"(union\s+select|select\s+.*\s+from|insert\s+into|drop\s+table|--|;|')",
            "XSS": r"(<script>|javascript:|onerror=|onload=|<a>)",
            "PathTraversal": r"(\.\.\/|\.\.\\|/etc/passwd|/windows/system32)",
            "CommandInjection": r"(&&|\|\||;|`|\$\(.*\))"
        }
        # Basit Hız Sınırlama (Rate Limiting) Belleği
        self.request_history = {} 

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host
        current_time = time.time()

        # 1. HIZ SINIRLAMA (Rate Limiting) - 1 saniyede max 10 istek
        if client_ip in self.request_history:
            last_request_time = self.request_history[client_ip]
            if current_time - last_request_time < 0.1: # 100ms kuralı
                raise HTTPException(status_code=429, detail="Aegis: Çok fazla istek! Sakin ol.")
        self.request_history[client_ip] = current_time

        # 2. İÇERİK ANALİZİ (Query & Body)
        query_params = str(request.query_params).lower()
        body = await request.body()
        full_content = query_params + body.decode('utf-8', errors='ignore').lower()

        for attack_type, pattern in self.patterns.items():
            if re.search(pattern, full_content):
                # Burada bir loglama sistemine (Logstash/DB) veri gönderilebilir
                print(f"ALERT: {attack_type} saldırısı engellendi! IP: {client_ip}")
                raise HTTPException(status_code=403, detail=f"Aegis Engine: {attack_type} Tespit Edildi!")

        # 3. GÜVENLİK BAŞLIKLARI (Hardening)
        response = await call_next(request)
        response.headers["X-Aegis-Version"] = "1.3-AI"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        return response
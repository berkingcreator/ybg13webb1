#Created by: YBG13™

import re
import time
import asyncio
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

class AegisAdvancedShield(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        # 1.5 Gelişmiş Tehdit Kütüphanesi
        self.patterns = {
            "SQLi": r"(union\s+select|select\s+.*\s+from|insert\s+into|drop\s+table|delete\s+from|--|;|\'|\")",
            "XSS": r"(<script.*?>|javascript:|onerror=|onload=|<a>|eval\(|setTimeout\()",
            "NoSQLi": r"(\$gt|\$ne|\$in|\$where|\$regex)",
            "PathTraversal": r"(\.\.\/|\.\.\\|/etc/passwd|/windows/system32|/proc/self/environ)",
            "CommandInjection": r"(&&|\|\||;|`|\$\(.*\)|system\(|exec\()"
        }
        self.request_history = {} 

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host
        current_time = time.time()

        # AKILLI HIZ SINIRLAMA (1 saniyede max 5 istek)
        history = self.request_history.get(client_ip, [])
        history = [t for t in history if current_time - t < 1.0]
        
        if len(history) >= 5:
            return JSONResponse(status_code=429, content={"error": "Aegis: Aşırı istek tespiti!"})
        
        history.append(current_time)
        self.request_history[client_ip] = history

        # DERİN İÇERİK ANALİZİ
        content_to_scan = str(request.query_params).lower()
        
        if request.method in ["POST", "PUT", "PATCH"]:
            body = await request.body()
            content_to_scan += body.decode('utf-8', errors='ignore').lower()

        for attack_type, pattern in self.patterns.items():
            if re.search(pattern, content_to_scan):
                print(f"🚨 [V1.5 ALERT] {attack_type} Engellendi! IP: {client_ip}")
                return JSONResponse(status_code=403, content={"error": f"Aegis Engine: {attack_type} Engellendi!"})

        # RESPONSE GÜVENLİĞİ
        response = await call_next(request)
        response.headers["X-Aegis-Version"] = "1.5-Pro-AI"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline';"
        response.headers["X-Powered-By"] = "YBG13-Aegis"
        return response
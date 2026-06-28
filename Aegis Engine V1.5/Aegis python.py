# "İnsanların en hayırlısı, insanlara faydalı olandır." - Hz. Muhammed (s.a.v)

import re
import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

class AegisAdvancedShield(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.patterns = {
            "SQLi": re.compile(r"(union\s+select|select\s+[\s\S]*?\s+from|insert\s+into|drop\s+table|delete\s+from|--|;|\'|\")", re.IGNORECASE),
            "XSS": re.compile(r"(<script[^>]*>|javascript:|onerror=|onload=|<a>|eval\(|setTimeout\()", re.IGNORECASE),
            "NoSQLi": re.compile(r"(\$gt|\$ne|\$in|\$where|\$regex)", re.IGNORECASE),
            "PathTraversal": re.compile(r"(\.\.\/|\.\.\\|/etc/passwd|/windows/system32|/proc/self/environ)", re.IGNORECASE),
            "CommandInjection": re.compile(r"(&&|\|\||;|`|\$\(.*?\)|system\(|exec\()", re.IGNORECASE)
        }
        self.request_history = {}
        self.last_cleanup = time.time()

    async def dispatch(self, request: Request, call_next):
        forwarded = request.headers.get("x-forwarded-for")
        client_ip = forwarded.split(",")[0].strip() if forwarded else request.client.host
        current_time = time.time()

        if current_time - self.last_cleanup > 60:
            self.request_history = {
                ip: hits for ip, hits in self.request_history.items() 
                if hits and current_time - hits[-1] < 1.0
            }
            self.last_cleanup = current_time

        history = self.request_history.get(client_ip, [])
        history = [t for t in history if current_time - t < 1.0]

        if len(history) >= 5:
            return JSONResponse(status_code=429, content={"error": "Aegis: Asiri istek tespiti!"})

        history.append(current_time)
        self.request_history[client_ip] = history

        content_to_scan = str(request.query_params)

        if request.method in ["POST", "PUT", "PATCH"]:
            body = await request.body()
            
            async def receive():
                return {"type": "http.request", "body": body}
            request._receive = receive
            
            content_to_scan += " " + body.decode('utf-8', errors='ignore')

        for attack_type, pattern in self.patterns.items():
            if pattern.search(content_to_scan):
                print(f"[V1.5 ALERT] {attack_type} Engellendi! IP: {client_ip}")
                return JSONResponse(status_code=403, content={"error": f"Aegis Engine: {attack_type} Engellendi!"})

        response = await call_next(request)
        response.headers["X-Aegis-Version"] = "1.5-Pro-AI"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        response.headers["X-Powered-By"] = "YBG13-Aegis"
        
        return response

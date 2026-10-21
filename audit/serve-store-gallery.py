"""Prévia local restrita aos arquivos públicos da galeria, sem expor o repositório."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "artifacts/store-assets-20261021/current-ui"
ALLOWED_UI = {"home.jpg", "ai.png", "editor.jpg", "prompter.jpg", "settings.jpg", "ipad-home.jpg", "ipad-editor.jpg"}
EVIDENCE = ROOT / "artifacts/export-security-20261021"
ALLOWED_EVIDENCE = {"02-formato-antes.jpg", "07-resultado-mobile.jpg", "08-youtube-desktop.jpg", "legenda-margem.png"}

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/revisao":
            file, kind = ROOT / "audit/revisao-export-seguranca-20261021.html", "text/html; charset=utf-8"
        elif path.startswith("/evidence/") and path[10:] in ALLOWED_EVIDENCE:
            file = EVIDENCE / path[10:]
            kind = "image/png" if file.suffix == ".png" else "image/jpeg"
        elif path in {"/", "/gallery.html"}:
            file, kind = ROOT / "audit/store-gallery-20261021.html", "text/html; charset=utf-8"
        elif path == "/brand/icon.png":
            file, kind = ROOT / "public/icon-512.png", "image/png"
        elif path == "/brand/creator.webp":
            file, kind = ROOT / "public/images/creator-studio.webp", "image/webp"
        elif path.startswith("/ui/") and path[4:] in ALLOWED_UI:
            file, kind = UI / path[4:], "image/jpeg"
        else:
            self.send_error(404)
            return
        if not file.is_file():
            self.send_error(404)
            return
        data = file.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_):
        pass

if __name__ == "__main__":
    print("Prévia da galeria: http://127.0.0.1:4176/", flush=True)
    HTTPServer(("127.0.0.1", 4176), Handler).serve_forever()

import threading
import webview
import app


def main():
    if not app.WEB.is_dir():
        raise SystemExit("Missing web directory")
    srv = app.make_server()
    url = f"http://{app.HOST}:{app.SERVER_PORT}"
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    webview.create_window(
        "MIDWAY Economy Control",
        url,
        width=1280,
        height=840,
        min_size=(980, 600),
        background_color="#0d0f13",
    )
    webview.start()
    srv.shutdown()


if __name__ == "__main__":
    main()

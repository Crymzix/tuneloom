"""Entry point for running the inference service as a module."""

import os
import uvicorn

from .config import config
from .api.app import create_app


def main():
    """Run the inference service."""
    app = create_app()
    port = int(os.getenv("PORT", "8080"))

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info",
        timeout_keep_alive=config.REQUEST_TIMEOUT,
    )


if __name__ == "__main__":
    main()

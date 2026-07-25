"""
HashiBot MT5 Agent - Logging Configuration
Provides structured log formatting with configurable log levels.
"""

import logging
import sys

def setup_logging(level_name: str = "INFO") -> logging.Logger:
    level = getattr(logging, level_name.upper(), logging.INFO)
    
    logger = logging.getLogger("HashiBotMT5Agent")
    logger.setLevel(level)
    logger.handlers.clear()
    
    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)
    
    logger.addHandler(console_handler)
    return logger

logger = setup_logging()

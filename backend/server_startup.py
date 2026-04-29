

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "server:app",
        host="127.0.0.1",
        port=5000,
        reload=False,
        log_level="info",
    )

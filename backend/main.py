from fastapi import FastAPI

app = FastAPI(title="Genie API")

@app.get("/health")
async def health():
    return {"ok": True}
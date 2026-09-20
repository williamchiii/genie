from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError

from errors import internal_error_handler, invalid_request_handler
from schemas.listing import ListingRequest
from schemas.result import CheckResult
from services.checks import check_listing as run_check, close_checks

@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        yield
    finally:
        await close_checks()


app = FastAPI(title="Genie API", lifespan=lifespan)
app.add_exception_handler(RequestValidationError, invalid_request_handler)
app.add_exception_handler(Exception, internal_error_handler)


@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/api/check", response_model=CheckResult)
async def check_listing(listing: ListingRequest):
    return await run_check(listing)

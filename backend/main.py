from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError

from errors import invalid_request_handler
from schemas.listing import ListingRequest

app = FastAPI(title="Genie API")
app.add_exception_handler(RequestValidationError, invalid_request_handler)


@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/api/check")
async def check_listing(listing: ListingRequest):
    return {
        "listingId": listing.listingId,
        "mode": "live",
        "status": "uncertain",
        "reason": "Service verification is not implemented yet.",
        "checkedAt": None,
        "linkState": "unknown",
        "replacementUrl": None,
        "sources": [],
        "cached": False,
    }

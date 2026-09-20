from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


async def invalid_request_handler(_request: Request, _error: RequestValidationError):
    return JSONResponse(
        status_code=400,
        content={
            "error": {
                "code": "INVALID_REQUEST",
                "message": "Provide valid JSON with all required listing fields and valid field values.",
            }
        },
    )

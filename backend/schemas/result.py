from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field, HttpUrl, model_validator


class Source(BaseModel):
    title: str = Field(min_length=1)
    url: HttpUrl
    excerpt: str = Field(min_length=1)
    retrievedAt: AwareDatetime


class SearchAttribution(BaseModel):
    renderedContent: str
    queries: list[str]


class CheckResult(BaseModel):
    listingId: str
    mode: Literal["live", "mock"] = "live"
    status: Literal["active", "closed", "uncertain"] = "uncertain"
    reason: str
    checkedAt: AwareDatetime | None = None
    linkState: Literal["working", "redirected", "broken", "stale", "unknown"] = "unknown"
    replacementUrl: HttpUrl | None = None
    sources: list[Source] = Field(default_factory=list)
    addressMismatch: bool = False
    cached: bool = False
    searchAttribution: SearchAttribution | None = None

    @model_validator(mode="after")
    def require_evidence(self):
        if self.mode == "live" and self.status != "uncertain" and not self.sources:
            raise ValueError("A service classification requires evidence")
        if self.replacementUrl is not None and (
            self.status != "active"
            or self.linkState not in {"broken", "stale"}
            or self.checkedAt is None
            or not self.sources
        ):
            raise ValueError("A replacement requires an active service and verified repair evidence")
        return self

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class ListingRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    listingId: str = Field(min_length=1)
    name: str = Field(min_length=1)
    website: HttpUrl | None
    address: str | None
    phone: str | None
    serviceType: str | None

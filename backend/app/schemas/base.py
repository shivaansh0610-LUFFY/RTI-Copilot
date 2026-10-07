from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    """Base for everything sent over the API.

    Python uses snake_case; the JSON uses camelCase so it matches src/types.ts
    field for field (e.g. publicly_available <-> publiclyAvailable).
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

package com.fern.openapi;

import io.swagger.parser.OpenAPIParser;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.parser.core.models.ParseOptions;

public final class OpenApiImporterCli {

    private OpenApiImporterCli() {
    }

    public static void parse(String openapi) {
        OpenAPI openAPI = new OpenAPIParser().readContents(openapi, null, new ParseOptions()).getOpenAPI();
        openAPI.getComponents();
    }

}

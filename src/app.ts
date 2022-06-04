import { FernSchema } from "@fern-api/syntax-analysis/lib/schemas";
import SwaggerParser from "@apidevtools/swagger-parser";
import { OpenAPIV3, OpenAPI } from "openapi-types";
import yaml from "js-yaml";
import { convertToFernType } from "./converters/typeConverter";
import { convertToFernService } from "./converters/serviceConverter";

SwaggerParser.parse("openapi.json", (err, api) => {
  if (err) {
    console.error(err);
  } else {
    if (api !== undefined) {
      if (!isOpenApiV3(api)) {
        console.log("Not V3!");
        return;
      }
      let fernSchema: Required<FernSchema> = {
        errors: {},
        imports: {},
        ids: [],
        types: {},
        services: {},
      };
      // Convert types
      if (
        api.components !== undefined &&
        api.components.schemas !== undefined
      ) {
        for (const typeName of Object.keys(api.components.schemas)) {
          const typeDefinition = api.components.schemas[typeName];
          if (isSchemaObject(typeDefinition)) {
            const fernConversionResult = convertToFernType(
              typeName,
              typeDefinition
            );
            for (const [
              convertedTypeName,
              convertedTypeDefinition,
            ] of Object.entries(fernConversionResult.typeDefinitions)) {
              fernSchema.types[convertedTypeName] = convertedTypeDefinition;
            }
          } else {
            console.log("Skipping reference object", typeName);
          }
        }
      }
      // Convert endpoints
      const fernService = convertToFernService(api.paths);
      fernSchema.services["http"] = {};
      fernSchema.services["http"]["FhirService"] = fernService;
      console.log(yaml.dump(fernSchema));
    }
  }
});

function isSchemaObject(
  typeDefinition: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
): typeDefinition is OpenAPIV3.SchemaObject {
  return !(typeDefinition as OpenAPIV3.ReferenceObject).$ref !== undefined;
}

function isOpenApiV3(openApi: OpenAPI.Document): openApi is OpenAPIV3.Document {
  return (openApi as OpenAPIV3.Document).openapi !== undefined;
}

// Object.entries(openApi.paths).forEach((path) => {
//   console.log(path);
//   path.length;
//   //   console.log(value);
//   let y: HttpEndpointSchema = {
//     method: "GET",
//     path: "https://path.com/",
//     errors: [],
//   };
//   let a = path[1];
//   //   convertSwaggerOpenApiPaths(a);
// });

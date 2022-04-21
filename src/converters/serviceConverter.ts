import {
  HttpEndpointSchema,
  HttpParameterSchema,
  HttpServiceSchema,
  TypeDefinitionSchema,
} from "@fern-api/syntax-analysis/lib/schemas";
import { OpenAPIV3 } from "openapi-types";
import {
  isReferenceObject,
  isSchemaObject,
  getTypeNameFromReferenceObject,
} from "./typeConverter";

export function convertToFernService(
  paths: OpenAPIV3.PathsObject
): HttpServiceSchema {
  let fernEndpoints: Record<string, HttpEndpointSchema> = {};
  for (const pathName of Object.keys(paths)) {
    const pathEndpoints = paths[pathName];
    if (pathEndpoints === undefined) {
      continue;
    }
    const convertedEndponts = convertToFernEndpoint(pathName, pathEndpoints);
    Object.entries(convertedEndponts).forEach((convertedEndpoint) => {
      fernEndpoints[convertedEndpoint[0]] = convertedEndpoint[1];
    });
  }
  return {
    endpoints: fernEndpoints,
  };
}

function convertToFernEndpoint(
  pathName: string,
  pathItem: OpenAPIV3.PathItemObject
): Record<string, HttpEndpointSchema> {
  let fernHttpEndpoints: Record<string, HttpEndpointSchema> = {};
  if (pathItem === undefined) {
    return fernHttpEndpoints;
  }
  if (pathItem.get !== undefined) {
    const fernGetEndpoint = getFernHttpEndpoint(
      pathName,
      pathItem.get,
      "GET",
      false,
      true
    );
    fernHttpEndpoints[fernGetEndpoint.operationId] =
      fernGetEndpoint.convertedEndpoint;
  } else if (pathItem.post !== undefined) {
    const fernPostEndpoint = getFernHttpEndpoint(
      pathName,
      pathItem.post,
      "POST",
      true,
      true
    );
    fernHttpEndpoints[fernPostEndpoint.operationId] =
      fernPostEndpoint.convertedEndpoint;
  } else if (pathItem.put !== undefined) {
    const fernPutEndpoint = getFernHttpEndpoint(
      pathName,
      pathItem.put,
      "POST",
      true,
      true
    );
    fernHttpEndpoints[fernPutEndpoint.operationId] =
      fernPutEndpoint.convertedEndpoint;
  } else if (pathItem.delete !== undefined) {
    const fernDeleteEndpoint = getFernHttpEndpoint(
      pathName,
      pathItem.delete,
      "POST",
      false,
      false
    );
    fernHttpEndpoints[fernDeleteEndpoint.operationId] =
      fernDeleteEndpoint.convertedEndpoint;
  } else if (pathItem.patch !== undefined) {
    console.log("Skipping patch endpoint");
  }
  return fernHttpEndpoints;
}

interface ConvertedHttpEndpointResponse {
  convertedEndpoint: HttpEndpointSchema;
  operationId: string;
}

function getFernHttpEndpoint(
  pathName: string,
  httpOperation: OpenAPIV3.OperationObject,
  httpMethod: "GET" | "PUT" | "POST" | "DELETE",
  addRequest: boolean,
  addResponse: boolean
): ConvertedHttpEndpointResponse {
  const operationId = getOperationIdOrThrow(httpOperation);
  let response = undefined;
  if (addResponse) {
    if (httpOperation.responses["200"] === undefined) {
      throw new Error(
        "Expected operation to contain 200 response. operationId=" + operationId
      );
    }
    response = convertToFernType(httpOperation.responses["200"]);
  }
  let request = undefined;
  if (addRequest) {
    if (httpOperation.requestBody === undefined) {
      throw new Error(
        "Expected operation to contain request body. operationId=" + operationId
      );
    }
    request = convertToFernType(httpOperation.requestBody);
  }
  return {
    convertedEndpoint: {
      method: httpMethod,
      path: pathName,
      parameters: getFernPathParameters(httpOperation),
      docs: httpOperation.description,
      response,
      request,
      errors: [],
    },
    operationId,
  };
}

function getOperationIdOrThrow(
  httpOperation: OpenAPIV3.OperationObject
): string {
  if (httpOperation.operationId === undefined) {
    throw new Error("Failed to retrieve operationId for path.");
  }
  return httpOperation.operationId;
}

function convertToFernType(
  response:
    | OpenAPIV3.ResponseObject
    | OpenAPIV3.ReferenceObject
    | OpenAPIV3.RequestBodyObject
): TypeDefinitionSchema {
  if (isReferenceObject(response)) {
    return getTypeNameFromReferenceObject(response);
  } else if (response.content !== undefined) {
    for (const contentType in response.content) {
      if (contentType.includes("json")) {
        const responseMediaInfo = response.content[contentType];
        if (responseMediaInfo.schema !== undefined) {
          if (isReferenceObject(responseMediaInfo.schema)) {
            return getTypeNameFromReferenceObject(responseMediaInfo.schema);
          } else {
            throw new Error("Converting inlined response types is unsupported");
          }
        }
      }
    }
  }
  throw new Error("Failed to convert response object to fern response");
}

function getFernPathParameters(
  pathOperation: OpenAPIV3.OperationObject
): Record<string, HttpParameterSchema> {
  const pathParameters: Record<string, HttpParameterSchema> = {};
  pathOperation.parameters?.forEach((parameter) => {
    if (isReferenceObject(parameter)) {
      throw new Error(
        "Converting reference type parameters is unsupported. Ref=" +
          parameter.$ref
      );
    }
    pathParameters[parameter.name] = convertToFernParameter(parameter);
  });
  return pathParameters;
}

function convertToFernParameter(
  parameter: OpenAPIV3.ParameterObject
): HttpParameterSchema {
  if (parameter.in !== "path") {
    throw new Error(
      "Converting non path parameters is unsupported. Parameter=" +
        parameter.name
    );
  }
  if (parameter.schema !== undefined) {
    if (isSchemaObject(parameter.schema)) {
      return convertSchemaToFernParameter(parameter.schema, parameter.name);
    } else {
      throw new Error(
        "Converting reference type parameters are unsupported. Parameter=" +
          parameter.in
      );
    }
  }
  throw new Error("Failed to convert parameter. Parameter=" + parameter.name);
}

function convertSchemaToFernParameter(
  schemaObject: OpenAPIV3.SchemaObject,
  parameterName: string
): HttpParameterSchema {
  if (schemaObject.type == undefined) {
    throw new Error(
      "Expected parameter schemas to have type. Parameter=" + parameterName
    );
  }
  if (schemaObject.type === "array") {
    throw new Error(
      "List parameters are unsupported. Parameter=" + parameterName
    );
  } else if (schemaObject.type == "boolean") {
    return "boolean";
  } else if (schemaObject.type == "integer") {
    return "integer";
  } else if (schemaObject.type == "number") {
    return "double";
  } else if (schemaObject.type == "string") {
    return "string";
  }
  throw new Error("Failed to convert parameter. Parameter=" + parameterName);
}

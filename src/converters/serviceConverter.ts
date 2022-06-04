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
  }
  if (pathItem.post !== undefined) {
    const fernPostEndpoint = getFernHttpEndpoint(
      pathName,
      pathItem.post,
      "POST",
      true,
      true
    );
    fernHttpEndpoints[fernPostEndpoint.operationId] =
      fernPostEndpoint.convertedEndpoint;
  }
  if (pathItem.put !== undefined) {
    const fernPutEndpoint = getFernHttpEndpoint(
      pathName,
      pathItem.put,
      "PUT",
      true,
      true
    );
    fernHttpEndpoints[fernPutEndpoint.operationId] =
      fernPutEndpoint.convertedEndpoint;
  }
  if (pathItem.delete !== undefined) {
    const fernDeleteEndpoint = getFernHttpEndpoint(
      pathName,
      pathItem.delete,
      "DELETE",
      false,
      false
    );
    fernHttpEndpoints[fernDeleteEndpoint.operationId] =
      fernDeleteEndpoint.convertedEndpoint;
  }
  if (pathItem.patch !== undefined) {
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
    const openApiResponse = getResponseOrThrow(operationId, httpOperation);
    response = convertToFernType(openApiResponse);
  }
  let request = undefined;
  if (addRequest) {
    const openApiRequest = getRequestOrThrow(operationId, httpOperation);
    request = convertToFernType(openApiRequest);
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

function getResponseOrThrow(
  operationId: string,
  httpOperation: OpenAPIV3.OperationObject
): OpenAPIV3.ReferenceObject | OpenAPIV3.ResponseObject {
  if ("200" in httpOperation.responses) {
    return httpOperation.responses["200"];
  } else if ("201" in httpOperation.responses) {
    return httpOperation.responses["201"];
  }
  throw new Error(
    "Expected operation to contain 200 or 201 response. operationId=" +
      operationId
  );
}

function getRequestOrThrow(
  operationId: string,
  httpOperation: OpenAPIV3.OperationObject
) {
  if (httpOperation.requestBody === undefined) {
    throw new Error(
      "Expected operation to contain request body. operationId=" + operationId
    );
  }
  return httpOperation.requestBody;
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

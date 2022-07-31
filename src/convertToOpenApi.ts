import {
    IntermediateRepresentation,
    TypeDeclaration,
    TypeReference,
    PrimitiveType,
    ContainerType,
    Type,
} from "@fern-fern/ir-model";
import { OpenAPIV3 } from "openapi-types";

export function convertToOpenApi(ir: IntermediateRepresentation): OpenAPIV3.Document<{}> | undefined {
    return undefined;
}

function convertToSchemas(types: TypeDeclaration[]): (OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject)[] {
    const result: (OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject)[] = [];
    for (const typeDeclaration of types) {
        if (typeDeclaration.shape._type === "object") {
            const properties: Record<string, OpenAPIV3.SchemaObject> = {};
            const requiredKeys: string[] = [];
            typeDeclaration.shape.properties.forEach((objectProperty) => {
                const convertedObjectProperty = convertTypeReference(objectProperty.valueType);
                properties[objectProperty.key] = {
                    ...convertedObjectProperty.result,
                    description: objectProperty.docs ?? undefined,
                };
                if (convertedObjectProperty.isReqiured) {
                    requiredKeys.push(objectProperty.key);
                }
            });

            const schemaObject: OpenAPIV3.SchemaObject = {
                type: "object",
                description: typeDeclaration.docs ?? undefined,
                properties,
                required: requiredKeys,
                allOf: typeDeclaration.shape.extends.map((declaredTypeName) => {
                    return {
                        $ref: `#/components/schemas/${declaredTypeName.name}`,
                    };
                }),
            };
            result.push(schemaObject);
        } else if (typeDeclaration.shape._type === "alias") {
            const convertedAliasOf = convertTypeReference(typeDeclaration.shape.aliasOf);
            result.push({
                ...convertedAliasOf.result,
                description: typeDeclaration.docs ?? undefined,
            });
        } else if (typeDeclaration.shape._type === "enum") {
            const enumSchemaObject: OpenAPIV3.SchemaObject = {
                type: "string",
                enum: typeDeclaration.shape.values.map((enumValue) => {
                    return enumValue.value;
                }),
            };
            result.push(enumSchemaObject);
        } else if (typeDeclaration.shape._type === "union") {
            const unionSchemaObject: OpenAPIV3.SchemaObject = {
                ...convertUnion(typeDeclaration.shape),
                description: typeDeclaration.docs ?? undefined,
            };
            result.push(unionSchemaObject);
        }
    }
    return result;
}

function convertUnion(union: Type.Union): OpenAPIV3.SchemaObject {
    const oneOfTypes: OpenAPIV3.SchemaObject[] = union.types.map((singleUnionType) => {
        const valueType = singleUnionType.valueType;
        const convertedValueType = convertTypeReference(valueType);
        if (valueType._type === "named") {
            let properties = {};
            properties[union.discriminant] = {
                type: "string",
                enum: [singleUnionType.discriminantValue],
            };
            return {
                type: "object",
                allOf: [
                    {
                        $ref: `#/components/schemas/${valueType.name}`,
                    },
                    {
                        type: "object",
                        properties,
                    },
                ],
            };
        } else {
            let properties = {};
            properties[union.discriminant] = {
                type: "string",
                enum: [singleUnionType.discriminantValue],
            };
            properties[union.discriminant] = convertedValueType;
            return {
                type: "object",
                properties,
            };
        }
    });
    return {
        oneOf: oneOfTypes,
    };
}

type OpenApiTypeConversionResult = OpenApiSchemaObjectResult | OpenApiReferenceObjectResult;

type OpenApiSchemaObjectResult = {
    type: "schema";
    result: OpenAPIV3.SchemaObject;
    isReqiured: boolean;
};

type OpenApiReferenceObjectResult = {
    type: "reference";
    result: OpenAPIV3.ReferenceObject;
    isReqiured: boolean;
};

function convertTypeReference(typeReference: TypeReference): OpenApiTypeConversionResult {
    if (typeReference._type === "primitive") {
        return {
            type: "schema",
            result: convertPrimitiveType(typeReference.primitive),
            isReqiured: true,
        };
    } else if (typeReference._type === "container") {
        return convertContainerType(typeReference.container);
    } else if (typeReference._type === "named") {
        return {
            type: "reference",
            result: {
                $ref: `#/components/schemas/${typeReference.name}`,
            },
            isReqiured: true,
        };
    } else if (typeReference._type === "void") {
        return {
            type: "schema",
            result: {
                type: "object",
            },
            isReqiured: true,
        };
    }
    throw new Error("Failed to convert typeReference to schema object: " + typeReference);
}

function convertPrimitiveType(primitiveType: PrimitiveType): OpenAPIV3.NonArraySchemaObject {
    return PrimitiveType._visit<OpenAPIV3.NonArraySchemaObject>(primitiveType, {
        boolean: () => {
            return { type: "boolean" };
        },
        dateTime: () => {
            return {
                type: "string",
                format: "date-time",
            };
        },
        double: () => {
            return {
                type: "number",
                format: "double",
            };
        },
        integer: () => {
            return {
                type: "integer",
            };
        },
        long: () => {
            return {
                type: "integer",
                format: "int64",
            };
        },
        string: () => {
            return { type: "string" };
        },
        uuid: () => {
            return {
                type: "string",
                format: "uuid",
            };
        },
        _unknown: () => {
            throw new Error("Encountered unknown primitiveType: " + primitiveType);
        },
    });
}

function convertContainerType(containerType: ContainerType): OpenApiTypeConversionResult {
    return ContainerType._visit<OpenApiTypeConversionResult>(containerType, {
        list: (listType) => {
            return {
                type: "schema",
                result: {
                    type: "array",
                    items: convertTypeReference(listType).result,
                },
                isReqiured: true,
            };
        },
        set: (setType) => {
            return {
                type: "schema",
                result: {
                    type: "array",
                    items: convertTypeReference(setType).result,
                },
                isReqiured: true,
            };
        },
        map: (mapType) => {
            return {
                type: "schema",
                result: {
                    type: "object",
                    additionalProperties: convertTypeReference(mapType.valueType).result,
                },
                isReqiured: true,
            };
        },
        optional: (optionalType) => {
            return {
                ...convertTypeReference(optionalType),
                isReqiured: false,
            };
        },
        _unknown: () => {
            throw new Error("Encountered unknown containerType: " + containerType);
        },
    });
}

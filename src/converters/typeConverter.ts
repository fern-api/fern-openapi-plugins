import {
  FernSchema,
  TypeDefinitionSchema,
} from "@fern-api/syntax-analysis/lib/schemas";
import { OpenAPIV3 } from "openapi-types";
import _ from "lodash";

export interface FernTypeConversionResult {
  typeDefinitions: Record<string, TypeDefinitionSchema>;
}

const EMPTY_OBJECT_TYPE_DEFINITION = {
  fields: {},
};

export function convertToFernType(
  typeName: string,
  schemaObject: OpenAPIV3.SchemaObject
): FernTypeConversionResult {
  let conversionResult: FernTypeConversionResult = {
    typeDefinitions: {},
  };
  if (_.isEmpty(schemaObject)) {
    conversionResult.typeDefinitions[typeName] = EMPTY_OBJECT_TYPE_DEFINITION;
  } else if (schemaObject.oneOf !== undefined) {
    console.log("Skipping oneOf");
  } else if (schemaObject.enum !== undefined) {
    conversionResult.typeDefinitions[typeName] = {
      enum: schemaObject.enum.filter((value) => typeof value === "string"),
    };
  } else if (schemaObject.type !== undefined) {
    if (schemaObject.type === "array") {
      if (schemaObject.items !== undefined) {
        if (isReferenceObject(schemaObject.items)) {
          conversionResult.typeDefinitions[typeName] =
            "list<" + getTypeNameFromReferenceObject(schemaObject.items) + ">";
        } else {
          const nestedConversionResult = convertToFernTypeNested(
            [typeName],
            "Item",
            schemaObject
          );
          conversionResult.typeDefinitions[typeName] =
            "list<" + nestedConversionResult.convertedTypeName + ">";
          if (nestedConversionResult.newTypeDefinitions !== undefined) {
            for (const [newTypeName, newTypeDefinition] of Object.entries(
              nestedConversionResult.newTypeDefinitions
            )) {
              conversionResult.typeDefinitions[newTypeName] = newTypeDefinition;
            }
          }
        }
      }
    } else {
      conversionResult.typeDefinitions[typeName] =
        convertNonArraySchemaObjectType(schemaObject.type);
    }
  } else if (schemaObject.properties !== undefined) {
    let objectTypeDefinition: TypeDefinitionSchema = { fields: {} };
    for (const propertyName of Object.keys(schemaObject.properties)) {
      const propertyType = schemaObject.properties[propertyName];
      if (isReferenceObject(propertyType)) {
        objectTypeDefinition.fields[propertyName] =
          getTypeNameFromReferenceObject(propertyType);
      } else {
        const nestedConversionResult = convertToFernTypeNested(
          [typeName],
          propertyName,
          propertyType
        );
        objectTypeDefinition.fields[propertyName] =
          nestedConversionResult.convertedTypeName;
        if (nestedConversionResult.newTypeDefinitions !== undefined) {
          for (const [newTypeName, newTypeDefinition] of Object.entries(
            nestedConversionResult.newTypeDefinitions
          )) {
            conversionResult.typeDefinitions[newTypeName] = newTypeDefinition;
          }
        }
      }
    }
    conversionResult.typeDefinitions[typeName] = objectTypeDefinition;
  }
  return conversionResult;
}

interface NestedFernTypeConversionResult {
  convertedTypeName: string;
  newTypeDefinitions?: Record<string, TypeDefinitionSchema>;
}

function convertToFernTypeNested(
  typeNameHierarchy: string[],
  schemaObjectTypeName: string,
  schemaObject: OpenAPIV3.SchemaObject
): NestedFernTypeConversionResult {
  if (schemaObject.enum !== undefined) {
    const enumTypeName = getTypeName([
      ...typeNameHierarchy,
      schemaObjectTypeName,
    ]);
    return {
      convertedTypeName: enumTypeName,
      newTypeDefinitions: {
        [enumTypeName]: {
          enum: schemaObject.enum.filter((value) => typeof value === "string"),
        },
      },
    };
  } else if (schemaObject.type !== undefined) {
    if (schemaObject.type === "array") {
      if (schemaObject.items !== undefined) {
        if (isReferenceObject(schemaObject.items)) {
          return {
            convertedTypeName:
              "list<" +
              getTypeNameFromReferenceObject(schemaObject.items) +
              ">",
          };
        } else {
          const nestedConversionResult = convertToFernTypeNested(
            [...typeNameHierarchy, schemaObjectTypeName],
            "Item",
            schemaObject.items
          );
          return {
            convertedTypeName:
              "list<" + nestedConversionResult.convertedTypeName + ">",
            newTypeDefinitions: {
              ...nestedConversionResult.newTypeDefinitions,
            },
          };
        }
      }
    } else if (schemaObject.type == "boolean") {
      return { convertedTypeName: "boolean" };
    } else if (schemaObject.type == "integer") {
      return { convertedTypeName: "integer" };
    } else if (schemaObject.type == "number") {
      return { convertedTypeName: "double" };
    } else if (schemaObject.type == "string") {
      return { convertedTypeName: "string" };
    }
  }
  console.error("Reached end of fern nested converter", schemaObject);
  throw new Error("Reached end of fern nested converter!");
}

function convertNonArraySchemaObjectType(
  nonArraySchemaObjectType: OpenAPIV3.NonArraySchemaObjectType
): TypeDefinitionSchema {
  if (nonArraySchemaObjectType == "boolean") {
    return "boolean";
  } else if (nonArraySchemaObjectType == "integer") {
    return "integer";
  } else if (nonArraySchemaObjectType == "number") {
    return "double";
  } else if (nonArraySchemaObjectType == "string") {
    return "string";
  } else if (nonArraySchemaObjectType == "object") {
    return EMPTY_OBJECT_TYPE_DEFINITION;
  } else {
    throw new Error(
      "Encountered unknown nonArraySchemaObjectType: " +
        nonArraySchemaObjectType
    );
  }
}

function getReferenceObject(
  typeDefinition: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
): OpenAPIV3.ReferenceObject {
  if (isReferenceObject(typeDefinition)) {
    return typeDefinition;
  }
  console.log(typeDefinition);
  throw Error("Coerced reference object to schema object");
}

function isSchemaObject(
  typeDefinition: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
): typeDefinition is OpenAPIV3.SchemaObject {
  return (typeDefinition as OpenAPIV3.ReferenceObject).$ref === undefined;
}

function isReferenceObject(
  typeDefinition: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
): typeDefinition is OpenAPIV3.ReferenceObject {
  return (typeDefinition as OpenAPIV3.ReferenceObject).$ref !== undefined;
}

function getTypeNameFromReferenceObject(
  referenceObject: OpenAPIV3.ReferenceObject
): string {
  return referenceObject.$ref.replace("#/components/schemas/", "");
}

function getTypeName(typeNameHierarchy: string[]) {
  return typeNameHierarchy.map((typeName) => _.capitalize(typeName)).join("");
}

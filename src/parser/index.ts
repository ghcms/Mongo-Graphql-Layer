import { groupHooks, groupHooksInterface } from "../accessControl/groupHooks";
import { arrayToObject } from "../general";
import { ObjectId } from "mongodb";
import { merge } from "../merge";

import schemaObject from "./types/object";
import HookFunction from "../accessControl/hook";
import schemaValue from "./types/value";
import schemaNested from "./types/nested";

export interface processedObject {
    identifier: string;
    parent: string;
    parents: string[];
    values: Array<schemaValue.init>;
}

export interface Output {
    processed: {
        nested: { [x: string]: schemaNested.init };
        values: { [x: string]: processedObject };
        object: { [x: string]: schemaObject.init };
    };
    hookBank: {
        [x: string]: groupHooksInterface
    };
}

export function parse(object: schemaObject.init): Output {
    let returnable: {
        nested: { [x: string]: schemaNested.init };
        values: { [x: string]: processedObject };
        object: { [x: string]: schemaObject.init };
    } = {
        nested: {},
        values: {},
        object: {}
    };

    let hookBank: {
        [key: string]: groupHooksInterface
    } = {};

    const walk = (
        schema: schemaObject.init | schemaObject.ValueInterface | schemaNested.ValueInterface,
        parents: Array<schemaObject.init | schemaNested.init> = [],
        parentsId: Array<string> = [],
        parentsKeys: Array<string> = []): void => 
    {

        // ---------------------------------[ Object ]--------------------------------- //
        // Recurse through the schema if the schema
        // an instance of schemaObject.init
        if(schema instanceof schemaObject.init) {
            const objectIdentifier: string = new ObjectId().toString();

            schema.identifier = objectIdentifier;

            schema.key = schema.options.name;

            merge(returnable.object, {
                [objectIdentifier]: schema
            });

            // Recurse
            walk(
                schema.obj, 
                [...parents, schema], 
                [...parentsId, objectIdentifier],
                [...parentsKeys, schema.options.name]
            );
        } 
        
        // ----------------------------------[ Value ]--------------------------------- //
        else {
            
            const objKeys = Object.keys(schema);

            let temporaryReturnable: any = {};

            for(let i = 0; i < objKeys.length; i++) {
                // ------------------------------[ Nested ]---------------------------- //
                if(schema[objKeys[i]] instanceof schemaNested.init) {
                    // Generate a new identifier
                    const nestedIdentifier: string = new ObjectId().toString(),
                        // Get the nested object
                        value = schema[objKeys[i]] as schemaNested.init;

                    // Set the parent
                    value.parent = parentsId[parentsId.length - 1];

                    // Set the parents
                    value.parents = [...parentsId, value.parent];

                    // Set the unique identifier
                    value.identifier = nestedIdentifier;

                    value.key = objKeys[i];

                    // Merge the returnable
                    merge(returnable.nested, {
                        [nestedIdentifier]: value
                    });

                    // Recurse
                    walk(
                        value.obj,
                        parents,
                        [...parentsId, nestedIdentifier],
                        [...parentsKeys, objKeys[i]]
                    );

                    // Stop the loop from progressing
                    continue;
                }

                // -----------------------------[ General ]---------------------------- //
                const key = objKeys[i],
                    value = schema[key] as schemaValue.init,
                    valueIdentifier: string = new ObjectId().toString();

                // Assign an unique identifier to each value
                value.identifier = valueIdentifier;


        
                // -----------------------------[ Unique ]---------------------------- //
                // Check if we have a unique value
                if(value.options?.unique === true) {
                    value.unique = true;

                    // Push the value to the uniqueValues array
                    parents[parents.length - 1]
                        .uniqueValues.push(valueIdentifier);
                }



                // -----------------------------[ Mask ]----------------------------- //
                // We store two different types of masks in the schema
                // One is the mask passed to us by the user
                // The other is the mask that is generated by the system
                // It will be the mask used to get the data from the database

                //
                // Schema Mask
                //

                // set the mask array
                value.mask.schema.maskArray = [key];

                // set the mask key
                value.mask.schema.key = key;

                // set the mask object
                value.mask.schema.mask = arrayToObject(value.mask.schema.maskArray);

                //
                // Database Mask
                //
                if(value.options.mask) {
                    // We need to grab the furthest child in the object
                    const maskRecurse = (obj: {[x: string]: number | {}}, maskArray: Array<string> = []) => {
                        for (const key in obj) {
                            const value = obj[key];
                            maskArray.push(key);
                            if (value instanceof Object)
                                maskRecurse(value, maskArray);
                        }

                        return maskArray;
                    }

                    // generate the mask array
                    const maskArray = maskRecurse(value.options.mask);
                    
                    // Set the mask key
                    value.mask.database.key = maskArray[maskArray.length - 1];

                    // Set the mask array
                    value.mask.database.maskArray = maskArray

                    // set the schema object mask
                    value.mask.database.mask = arrayToObject(value.mask.database.maskArray);
                } 
                // If the user did not specify a mask, we can use the default mask
                else value.mask.database = value.mask.schema;



                // -----------------------[ Additional values ]----------------------- //
                // Values can have additional values that are not in the database
                // Such as if the value is unique, or its description
                // We can add these values to the value object

                // Check if we have a unique value
                if(value.options?.unique === true) 
                    value.additionalValues.push({
                        key: `is${value.mask.schema.key}Unique`,
                        value: true
                });

                // Check if we have a description
                if(value.options?.description)
                    value.additionalValues.push({
                        key: `${value.mask.schema.key}Description`,
                        value: value.options.description
                });

                

                // -----------------------------[ Hooks ]----------------------------- //
                // As a form of optimization, we preprocess the hooks and group them.
                // This allows us to run the hooks in a single function for multiple values.
                // This is a lot faster than running the hooks individually, and
                // processing the hooks during the query.

                if(value.options.accessControl) {
                    // Initialize the access control function of this value
                    const hookObject = 
                        new HookFunction.init(value.options.accessControl);

                    // Group the hooks together
                    const grouped = 
                        groupHooks(hookBank, hookObject, value);

                    // Assign the value hook identifiers
                    value.hookIdentifers = grouped.hookIdentifiers;

                    // set the hook bank
                    hookBank = grouped.hookBank;
                }



                // --------------------------[ Returnable ]-------------------------- //
                merge(temporaryReturnable, {
                    [key]: value
                });
            }

            const valuesID = new ObjectId().toString();

            merge(returnable.values, {
                [valuesID]: {
                    parent: parentsId[parentsId.length - 1],
                    parents: parentsId,
                    identifier: valuesID,
                    values: temporaryReturnable
                }
            });
        }
    }

    walk(object);

    return {
        processed: returnable,
        hookBank
    }
}
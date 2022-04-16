import _ from 'lodash';

export interface FilterInterface {
    [key: string]: number | FilterInterface
}

export interface ArgumentsInterface {
    [key: string]: any
}

export default (context:any): {
    filter: FilterInterface,
    arguments: ArgumentsInterface
} => {
    let filter: FilterInterface = {};
    let args: ArgumentsInterface = {};

    const recurse = (selection:any, parentName:string[] = []): void => {
        
        for(const newSelection in Object.keys(selection)) {
            // Current selection
            const current: any = selection[newSelection];

            // If the current selection is a field
            if(current?.kind === 'Field') {
                // If the current selection name is not null
                if(current.name === null) continue;

                // If the parent name is not undefined
                if(parentName[0] !== undefined) {
                    // turn tje parentName array into an object
                    // eg [ 'hello', 'other' ], name => { hello: other: { name: 1 } }

                    _.merge(filter, [...parentName, null].reduceRight((obj: {}, next : string | null):  { [x: string]: {}}  => {
                        if(next === null) return ({[current.name.value]: 1});

                        return ({[next]: obj});
                    }, {})); 
                }
                    
                // If the parent name is null,
                // then merge the filter with the current selection
                else {
                    _.merge(filter, {[current.name.value]: 1});

                    // if(current?.arguments) { 
                    //     _.merge(args, {[current.name.value]: 1});
                    // }
                }

                _.merge(args, [...parentName, null].reduceRight((obj: {}, next : string | null):  { [x: string]: {}}  => {
                    if(next === null) {
                        let returnable: {[x: string]: any} = {};

                        for(const argument of current.arguments) {
                            if(argument.value?.fields) for (const field of argument.value.fields) {
                                returnable[field.name.value] = field.value.value;
                            }

                            else returnable[argument.name.value] = argument.value.value;
                        }

                        if(Object.keys(returnable).length > 0) 
                            return { [current.name.value]: returnable };

                        else return {};
                    }

                    return ({[next]: obj});
                }, {}));
            }

            // If the current selection is an array, we need to recurse
            if(current?.selectionSet?.selections)
                recurse(current.selectionSet.selections, [...parentName, current.name.value]);
        }
    }

    // Start the recursive function
    recurse(context.operation.selectionSet.selections);

    // Finally return the filter
    return {
        filter,
        arguments: args
    };
}
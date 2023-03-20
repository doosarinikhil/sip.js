const sleep = (seconds: number): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve(true);
        }, seconds * 1000)
    })
}

const reducePromises = (arr: Array<any>, val: any): Promise<any> => {
    return arr.reduce((acc, fn) => {
        acc = acc.then(fn);
        return acc;
    }, Promise.resolve(val));
}

export { sleep, reducePromises }
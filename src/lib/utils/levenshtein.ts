export function levenshteinDistance(a: string, b: string): number {
    const tmp: number[][] = [];


    for (let i = 0; i <= a.length; i++) {
        tmp[i] = [i];
    }


    for (let j = 0; j <= b.length; j++) {
        tmp[0][j] = j;
    }


    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            tmp[i][j] = Math.min(tmp[i - 1][j] + 1, tmp[i][j - 1] + 1, tmp[i - 1][j - 1] + cost);
        }
    }


    return tmp[a.length][b.length];
}
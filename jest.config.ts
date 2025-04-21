import { JestConfigWithTsJest, pathsToModuleNameMapper } from 'ts-jest';
// use this instead of 'ts-jest/utils' if you get a deprecation warning
import { compilerOptions } from './tsconfig.json';

const config: JestConfigWithTsJest = {
	testEnvironment: 'node',
	modulePathIgnorePatterns: ['<rootDir>/dist/'],
	transform: {
		'^.+\\.tsx?$': ['ts-jest', {}]
	},
	moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
		prefix: '<rootDir>/'
	})
};

export default config;

#!/usr/bin/env node

import { watch } from "fs/promises";
import { spawn } from "child_process";

const [directory, ...args] = process.argv.slice(2);
const { log } = console;

const abortController = new AbortController();

process.on("beforeExit", abortController.abort.bind(abortController));

/**
 * @param {function}
 * @returns {function}
 */
function debounce(fn) {
	let timer;
	return function debounced() {
		clearTimeout(timer);
		timer = setTimeout(fn.bind(this, ...arguments), 1000);
	};
}

/**
 * @returns {ChildProcess}
 */
function play() {
	log(["[RUNNING]", "npm", "run", ...args].join(" "));
	const child = spawn("npm", ["run", ...args]);
	child.stdout.on("data", process.stdout.write.bind(process.stdout));
	child.stderr.on("data", process.stderr.write.bind(process.stderr));
	child.on("error", (error) => log(error) || kill(child));
	["exit", "disconnect"].forEach((event) =>
		child.on(event, (code) => {
			child.killed = true;
			log(`Process ${event} with code ${code}`);
		})
	);

	return child;
}

/**
 * @param {ChildProcess} child
 * @returns {Promise<void>}
 */
const kill = (child) =>
	new Promise(function (resolve, reject) {
		if (!child || child.killed) {
			resolve();
			return;
		}
		try {
			child.on("exit", resolve);
			child.on("close", resolve);
			child.on("disconnect", resolve);
			child.on("error", reject);
			child.kill("SIGINT");
		} catch (error) {
			reject(error);
		}
	});

/**
 * @param {AbortController} abortController
 * @returns {Promise<void>}
 */
async function start({ abortController }) {
	let child = play();
	const replayD = debounce(async function replay(event) {
		try {
			await kill(child);
		} catch (error) {
			log(error);
		}
		child = play();
	});
	const watcher = watch(directory, {
		recursive: true,
		signal: abortController?.signal,
	});
	for await (const event of watcher) {
		replayD(event);
	}
}

start({ abortController }).catch(function abortAndExit(error) {
	abortController.abort();
	log(error);
	process.exit(1);
});

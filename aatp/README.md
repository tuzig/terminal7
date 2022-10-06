# Quality Automation

TL:DR; From the project's root `./aatp/run`

This folder contains automated acceptance test procedures for Terminal7. 
The test are using docker-compose for lab setup and playwright
for end-to-end and user journies testing. It also include lint which is for
now failing. We need to refactor all of T7 to TypeScript before we can hope
of passing the linter. 

After the linter the scipt runs `npm test` to run unit tests and only if 
they pass run the heavier, compose-based tests. For now, we have tests for
two domains: `peerbook_webrtc` & `http_webrtc`

The main script is `./aatp/run` and when you run it with no arguments
it starts by running the linter which fails. 
It'll probably keep failing until we have the code in TypeScript.
After failing the linter, the scripts runs the unit tests and
finally the scenario tests. 

The script can also accept one of more argument with a folder name.
Each of these folders focus on a different aspect of users' scenarios.

## The runner

We use [playwright](https://playwright.dev) as the test runner and use
its syntax and expectations. To pass options to playwright use the 
`PWARGS` enviornment variable. I use it to get the tests to stop
after the first failure and keep the logs short:

```
PWARGS=-x ./aatp/run aatp/fubar
```

Run `npx playwright test --help` for the list of options

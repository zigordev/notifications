# Changelog

## [0.1.28](https://github.com/zigordev/notifications/compare/v0.1.27...v0.1.28) (2026-09-24)


### Bug Fixes

* **notifications:** tell a dead letter that can never parse from one that failed right now ([#158](https://github.com/zigordev/notifications/issues/158)) ([4d637bc](https://github.com/zigordev/notifications/commit/4d637bcb510bfdbb7315d6a77e1a548a8855c18b))

## [0.1.27](https://github.com/zigordev/notifications/compare/v0.1.26...v0.1.27) (2026-09-23)


### Bug Fixes

* **observability:** take the kit as it is, byte for byte ([#155](https://github.com/zigordev/notifications/issues/155)) ([8e88fc5](https://github.com/zigordev/notifications/commit/8e88fc53872fa9cf669638868f4df27973cef358))

## [0.1.26](https://github.com/zigordev/notifications/compare/v0.1.25...v0.1.26) (2026-09-23)


### Bug Fixes

* **observability:** rename the last two snake_case event names ([#153](https://github.com/zigordev/notifications/issues/153)) ([84c1de0](https://github.com/zigordev/notifications/commit/84c1de0559c0a4d90a69269297c8b7c7293b4621))

## [0.1.25](https://github.com/zigordev/notifications/compare/v0.1.24...v0.1.25) (2026-09-23)


### Bug Fixes

* **notifications:** count dead letters whose payload never parsed ([#151](https://github.com/zigordev/notifications/issues/151)) ([c3946fa](https://github.com/zigordev/notifications/commit/c3946faf4dacccf6fcb9ce8e492818bc9bb3321e))

## [0.1.24](https://github.com/zigordev/notifications/compare/v0.1.23...v0.1.24) (2026-09-23)


### Features

* **observability:** bring notifications-api to the estate's kit and events ([#149](https://github.com/zigordev/notifications/issues/149)) ([e82b2ca](https://github.com/zigordev/notifications/commit/e82b2ca6c20ca29cb725262679cd1a9ed2cc87fb))

## [0.1.23](https://github.com/zigordev/notifications/compare/v0.1.22...v0.1.23) (2026-09-22)


### Bug Fixes

* **metrics:** start every template's counters at zero ([#147](https://github.com/zigordev/notifications/issues/147)) ([0498759](https://github.com/zigordev/notifications/commit/0498759e2e7ba655e88e1d8e16a81a9ce1772d9c))

## [0.1.22](https://github.com/zigordev/notifications/compare/v0.1.21...v0.1.22) (2026-09-21)


### Features

* **observability:** export the release as service_build_info ([#133](https://github.com/zigordev/notifications/issues/133)) ([e541494](https://github.com/zigordev/notifications/commit/e54149416437e7920434440d25677c95dc1833f2))

## [0.1.21](https://github.com/zigordev/notifications/compare/v0.1.20...v0.1.21) (2026-09-21)


### Bug Fixes

* **observability:** send traces to the collector's real path ([#132](https://github.com/zigordev/notifications/issues/132)) ([ff9b3c8](https://github.com/zigordev/notifications/commit/ff9b3c8ea84b3ab388a9189a0b573343bfeaf9fc))

## [0.1.20](https://github.com/zigordev/notifications/compare/v0.1.19...v0.1.20) (2026-09-21)


### Bug Fixes

* **observability:** name a trace only when it was sampled ([#130](https://github.com/zigordev/notifications/issues/130)) ([2f4bd7a](https://github.com/zigordev/notifications/commit/2f4bd7a82bf9be0c6fbd960d109e5932bf759932))

## [0.1.19](https://github.com/zigordev/notifications/compare/v0.1.18...v0.1.19) (2026-09-21)


### Features

* **notifications:** flat log events, SMTP health and a deploy that checks it ([#126](https://github.com/zigordev/notifications/issues/126)) ([754e11d](https://github.com/zigordev/notifications/commit/754e11d4babfff94cb0dd3e72c61d1ecf09bdf71))

## [0.1.18](https://github.com/zigordev/notifications/compare/v0.1.17...v0.1.18) (2026-09-20)


### Features

* **observability:** trace each email from its producer to SMTP ([#124](https://github.com/zigordev/notifications/issues/124)) ([cc316cc](https://github.com/zigordev/notifications/commit/cc316cca8c0c7e5405f50d659a99fac8dff7104f))

## [0.1.17](https://github.com/zigordev/notifications/compare/v0.1.16...v0.1.17) (2026-09-20)


### Bug Fixes

* **lifecycle:** stop cleanly on SIGTERM and start without warnings ([#121](https://github.com/zigordev/notifications/issues/121)) ([a3cc981](https://github.com/zigordev/notifications/commit/a3cc981e9c6dc7653649e96907e7939f309e1852))

## [0.1.16](https://github.com/zigordev/notifications/compare/v0.1.15...v0.1.16) (2026-09-12)


### Bug Fixes

* **docker:** build the api image on node 24 ([#93](https://github.com/zigordev/notifications/issues/93)) ([5a8b493](https://github.com/zigordev/notifications/commit/5a8b493a32578b5144061d67f566ecacf1d404d7))

## [0.1.15](https://github.com/zigordev/notifications/compare/v0.1.14...v0.1.15) (2026-09-09)


### Bug Fixes

* **api:** log why a 5xx happened, even though the response will not say ([#91](https://github.com/zigordev/notifications/issues/91)) ([f62dcd9](https://github.com/zigordev/notifications/commit/f62dcd909fe90fac774aa6b16c435c8b94e93737))

## [0.1.14](https://github.com/zigordev/notifications/compare/v0.1.13...v0.1.14) (2026-09-09)


### Features

* **api:** send RFC 9457 problem details and mount health on its prefix ([#87](https://github.com/zigordev/notifications/issues/87)) ([9c8f6a5](https://github.com/zigordev/notifications/commit/9c8f6a59038b33233e9638deb82a4391a75e4316))

## [0.1.13](https://github.com/zigordev/notifications/compare/v0.1.12...v0.1.13) (2026-09-09)


### Bug Fixes

* **api:** send a content security policy instead of disabling it ([#85](https://github.com/zigordev/notifications/issues/85)) ([1e62daf](https://github.com/zigordev/notifications/commit/1e62daf66f19dbcb3e7d5c9d10233f473f4f160e))

## [0.1.12](https://github.com/zigordev/notifications/compare/v0.1.11...v0.1.12) (2026-09-09)


### Bug Fixes

* **release:** keep the workspace version in package-lock.json in step ([#80](https://github.com/zigordev/notifications/issues/80)) ([008b2b5](https://github.com/zigordev/notifications/commit/008b2b5976a4415817465ddd5e904f8927ad96a0))

## [0.1.11](https://github.com/zigordev/notifications/compare/v0.1.10...v0.1.11) (2026-09-09)


### Bug Fixes

* **deps:** take the patched multer and nodemailer ([#82](https://github.com/zigordev/notifications/issues/82)) ([bb2b352](https://github.com/zigordev/notifications/commit/bb2b352d23b6b85a7b80b39042cd28b2deccb58a))

## [0.1.10](https://github.com/zigordev/notifications/compare/v0.1.9...v0.1.10) (2026-09-08)


### Features

* **email:** tag outbound subjects with the environment ([#78](https://github.com/zigordev/notifications/issues/78)) ([1787702](https://github.com/zigordev/notifications/commit/1787702484ced0260af4c9f3853de4699747d19e))

## [0.1.9](https://github.com/zigordev/notifications/compare/v0.1.8...v0.1.9) (2026-09-07)


### Features

* **docker:** run the worker under compose watch for local development ([#69](https://github.com/zigordev/notifications/issues/69)) ([0e7d786](https://github.com/zigordev/notifications/commit/0e7d786aedd38e59ea20143b5227a6ed9d6487a4))

## [0.1.8](https://github.com/zigordev/notifications/compare/v0.1.7...v0.1.8) (2026-09-06)


### Bug Fixes

* **ci:** merge with a PAT so push-triggered workflows still run ([#52](https://github.com/zigordev/notifications/issues/52)) ([c2a6ea3](https://github.com/zigordev/notifications/commit/c2a6ea3569c5835ba1988fbd0a60103d149cc96a))
* **ci:** raise commitlint header-max-length to fit Dependabot titles ([a4be950](https://github.com/zigordev/notifications/commit/a4be95040789d1a90ac24f0d8c04deb497be9e0e))
* **deps:** realign @nestjs/schematics with the Nest 11 stack ([#53](https://github.com/zigordev/notifications/issues/53)) ([230753b](https://github.com/zigordev/notifications/commit/230753bb7dce9ba2569819d8b3c6fda6ecfa9644))

## [0.1.7](https://github.com/zigordev/notifications/compare/v0.1.6...v0.1.7) (2026-09-04)


### Features

* migrate notifications service to TypeScript ([81065f2](https://github.com/zigordev/notifications/commit/81065f20b2042bebae3f90cf1f1d174fed7be01e))
* **observability:** converge on the shared health/metrics/tracing kit ([c0a6b82](https://github.com/zigordev/notifications/commit/c0a6b82072ca3729a8a17392e7b7b8e27879a413))
* **security:** set security headers with helmet ([f2bed81](https://github.com/zigordev/notifications/commit/f2bed81daccfde0ba24a93f1b1a1c09465839ab1))
* **templates:** add the cv contact-received email ([2a3aee6](https://github.com/zigordev/notifications/commit/2a3aee62d9b9044797af6763b8ddbd42cb8df0b8))


### Bug Fixes

* **ci:** grant gitleaks the pull-requests:read it needs on Dependabot PRs ([a63a33a](https://github.com/zigordev/notifications/commit/a63a33a22540fa74d483e5323f776eb6d5a4c402))
* **ci:** retry npm audit on transient registry failures ([9b2b797](https://github.com/zigordev/notifications/commit/9b2b79776c4feb0eb42b7670c87d19c19257a8e9))
* **ci:** stop format:check from failing on generated CHANGELOG.md ([038c91c](https://github.com/zigordev/notifications/commit/038c91c0d87328d1f004fbd2e9f674bc2023ff3e))
* **docker:** stop the husky prepare script breaking the image build ([0b858bc](https://github.com/zigordev/notifications/commit/0b858bcb418658c86ac466f063b81d79273d3f40))
* **security:** strip the bundled npm CLI and patch Alpine at build time ([7c5b700](https://github.com/zigordev/notifications/commit/7c5b7008349f9c3f04409b4b31212572d9fe8f95))

## [0.1.6](https://github.com/zigordev/notifications/compare/v0.1.5...v0.1.6) (2026-06-29)

### Features

- added kini invitation email template ([6c9a772](https://github.com/zigordev/notifications/commit/6c9a772f045c9d72bf1a68a366cee0faaa2dfcbe))

## [0.1.5](https://github.com/zigordev/notifications/compare/v0.1.4...v0.1.5) (2026-06-18)

### Features

- move logs to centralized platforms-ops ([#21](https://github.com/zigordev/notifications/issues/21)) ([14c5c29](https://github.com/zigordev/notifications/commit/14c5c299cf326cec10c64c4ab8d1725b595aa5ed))

## [0.1.4](https://github.com/zigordev/notifications/compare/v0.1.3...v0.1.4) (2026-05-13)

### Features

- penbao prod config ([#18](https://github.com/zigordev/notifications/issues/18)) ([37de227](https://github.com/zigordev/notifications/commit/37de227eb6d61e4f2a9799308a093fc024c6283e))

## [0.1.3](https://github.com/zigordev/notifications/compare/v0.1.2...v0.1.3) (2026-05-13)

### Features

- openbao prod config ([#15](https://github.com/zigordev/notifications/issues/15)) ([b1fd9ec](https://github.com/zigordev/notifications/commit/b1fd9ec3481ccbd1dcffbe27f42181a6f039aa42))

## [0.1.2](https://github.com/zigordev/notifications/compare/v0.1.1...v0.1.2) (2026-05-13)

### Bug Fixes

- **docker:** copy versioned notifications jar ([#11](https://github.com/zigordev/notifications/issues/11)) ([e9b55ed](https://github.com/zigordev/notifications/commit/e9b55ede20f6669fe186f87da03a4833fb21b400))

## [0.1.1](https://github.com/zigordev/notifications/compare/v0.1.0...v0.1.1) (2026-05-13)

### Features

- add chance to translate templates ([3e74f05](https://github.com/zigordev/notifications/commit/3e74f051fdf7a4d7da29de4f6ae70facb036a146))
- add chance to translate templates ([a3aeed4](https://github.com/zigordev/notifications/commit/a3aeed485a8ce9cb8083fb0569687063574667dd))
- add cv contact email handling ([0ef7bb1](https://github.com/zigordev/notifications/commit/0ef7bb1ba963fafa576022b98f22ec7b91c07ce2))
- add cv contact email handling ([a2b4981](https://github.com/zigordev/notifications/commit/a2b4981a86c70c3698fa380cd7b6adac4d1d47bf))
- bootstrap notifications service ([fd7fbb4](https://github.com/zigordev/notifications/commit/fd7fbb4bc2004c32bd4fdb57174cb3e9e1b3f2be))
- prepare ci ([a082147](https://github.com/zigordev/notifications/commit/a082147b3b149872a155c20e2522fd685b01e12a))
- prepare ci ([e9e5e16](https://github.com/zigordev/notifications/commit/e9e5e1689104c6c85623b3528e67c4f154444c1e))
- prepare to deploy on PROD ([84b5cf0](https://github.com/zigordev/notifications/commit/84b5cf0a15746bd524600008ff916150249597b2))
- prepare to deploy on PROD ([6f93fc4](https://github.com/zigordev/notifications/commit/6f93fc4e392c4e81fd3af213e74ce41cf39c76fe))

### Documentation

- link cloud destroy runbook ([3572c89](https://github.com/zigordev/notifications/commit/3572c898d26e51f95110964d8eb071c2cd1b189e))
- link cloud destroy runbook ([030e867](https://github.com/zigordev/notifications/commit/030e867d95df7c221ba3e5d2d97c4e12b480b56f))

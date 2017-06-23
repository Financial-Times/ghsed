# ghsed

## CLI tool for mass find-replacing text strings across an entire GitHub user/org

#### 2017 Ændrew Rininsland <@aendrew>

> If sed is like a flamethrower for string replacement, ghsed is firebombing with napalm.

### Installation & Usage

`ghsed` should be installed globally:

```bash
$ npm i @financial-times/ghsed
```

You can then use it like so:

```bash
$ ghsed <sed expression> <target>
```

### Options

* `-e`, `--expr` **Expression:** Adds a sed find/replace extension. Can be used multiple times.
* `-i`, `--inplace` **Inplace:** Normally `ghsed` will create a branch and PR the changes, preventing users from committing directly to `master`. This flag allows committing to master while not opening a PR.

### Gotchas 'n' Caveats

* **The only real tested support in terms of `sed` commands at present is the `s/` verb.** If you try to do some really crazy-fancy sed scripting, you probably will be disappointed. There's an [open issue](https://github.com/Financial-Times/ghsed/issues/3) to improve this if you care to help!

* **For some crazy reason `parse-sed` requires escaping slashes to be _DOUBLE-SLASHED_** (across the sky! It's so beautiful!). For example, the following was used to replace all old `nextgee-bee` URLs in the @ft-interactive org:

```
./bin/ghsed.js \
-e "s/next-geebee\\.ft\\.com\\/assets/www\\.ft\\.com\\/__assets\\/creatives/" \
-e "s/next-geebee\\.ft\\.com\\/hashed-assets/www\\.ft\\.com\\/__assets\\/hashed/" \
-e "s/next-geebee\\.ft\\.com\\/n-ui/www\\.ft\\.com\\/__assets\\/n-ui/" \
-e "s/next-geebee\\.ft\\.com\\/image\\/v1/www\\.ft\\.com\\/__origami\\/service\\/image\\/v2/" \
-e "s/next-geebee\\.ft\\.com\\/build/www\\.ft\\.com\\/__origami\\/service\\/build/" \
-e "s/next-geebee\\.ft\\.com\\/polyfill/www\\.ft\\.com\\/__origami\\/service\\/polyfill/" \
"ft-interactive/*"
```

Normally you'd need 50% fewer slashes. [There's an open issue here](https://github.com/Financial-Times/ghsed/issues/2); if you have any ideas, please halp — I'd like to ultimately emulate the sed language as closely as possible.

* **Unit tests are incomplete and borked.** This is [due to an issue with Sinon in ts-node](https://github.com/TypeStrong/ts-node/issues/365). I'll improve test coverage once that's fixed, promise. :fingers_crossed:

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isGenerator = exports.Eff = exports.Result = exports.ctxSymbol = void 0;
var tslib_1 = require("tslib");
exports.ctxSymbol = Symbol('ctx');
exports.Result = {
    ok: function (value) {
        return {
            type: 'ok',
            value: value,
        };
    },
    err: function (name, error) {
        return {
            type: 'err',
            name: name,
            error: error,
        };
    },
};
var Eff = /** @class */ (function () {
    function Eff() {
    }
    Eff.run = function (input) {
        var process = function (result) {
            if (!result.done) {
                var effect = result.value;
                if (effect.type === 'async') {
                    return effect.value.then(function (value) {
                        return process(gen.next(value));
                    });
                }
                else {
                    throw new Error("Expected async effect, but got: ".concat(JSON.stringify(effect, null, 2)));
                }
            }
            return result.value;
        };
        var gen = typeof input === 'function' ? input() : input;
        return process(gen.next());
    };
    Eff.runResult = function (input) {
        var gen = typeof input === 'function' ? input() : input;
        // @ts-ignore expected
        return Eff.run(Eff.result(gen));
    };
    Eff.await = function (value) {
        var result;
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(value instanceof Promise)) {
                        return [2 /*return*/, value];
                    }
                    return [4 /*yield*/, {
                            type: 'async',
                            value: value,
                        }];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result];
            }
        });
    };
    Eff.result = function (gen) {
        var result, effect, _a, _b;
        return tslib_1.__generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    result = gen.next();
                    _c.label = 1;
                case 1:
                    if (!!result.done) return [3 /*break*/, 5];
                    effect = result.value;
                    if (!(effect.type === 'err')) return [3 /*break*/, 2];
                    return [2 /*return*/, effect];
                case 2:
                    _b = (_a = gen).next;
                    return [4 /*yield*/, effect];
                case 3:
                    result = _b.apply(_a, [_c.sent()]);
                    _c.label = 4;
                case 4: return [3 /*break*/, 1];
                case 5: return [2 /*return*/, {
                        type: 'ok',
                        value: result.value,
                    }];
            }
        });
    };
    /**
     * convert a generator to a generator that returns a value
     * move the err from return to throw
     */
    Eff.ok = function (gen) {
        var result;
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [5 /*yield**/, tslib_1.__values(gen)];
                case 1:
                    result = _a.sent();
                    if (!(result.type === 'ok')) return [3 /*break*/, 2];
                    return [2 /*return*/, result.value];
                case 2: return [4 /*yield*/, result];
                case 3: throw _a.sent();
            }
        });
    };
    Eff.err = function (name) {
        return {
            throw: function () {
                var _i;
                var args = [];
                for (_i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i];
                }
                return tslib_1.__generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, {
                                type: 'err',
                                name: name,
                                error: args[0],
                            }
                            /* istanbul ignore next */
                        ];
                        case 1:
                            _a.sent();
                            /* istanbul ignore next */
                            throw new Error("Unexpected resumption of error effect [".concat(name, "]"));
                    }
                });
            },
        };
    };
    Eff.ctx = function (name) {
        return {
            get: function () {
                var context;
                return tslib_1.__generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, {
                                type: 'ctx',
                                name: name,
                            }];
                        case 1:
                            context = _a.sent();
                            return [2 /*return*/, context];
                    }
                });
            },
        };
    };
    Eff.try = function (input) {
        return {
            catch: function (handlers) {
                var gen, result, effect, errorHandler, _a, _b, context, _c, _d, _e, _f;
                return tslib_1.__generator(this, function (_g) {
                    switch (_g.label) {
                        case 0:
                            gen = typeof input === 'function' ? input() : input;
                            result = gen.next();
                            _g.label = 1;
                        case 1:
                            if (!!result.done) return [3 /*break*/, 12];
                            effect = result.value;
                            if (!(effect.type === 'err')) return [3 /*break*/, 5];
                            errorHandler = handlers[effect.name];
                            if (!(typeof errorHandler === 'function')) return [3 /*break*/, 2];
                            return [2 /*return*/, errorHandler(effect.error)];
                        case 2:
                            _b = (_a = gen).next;
                            return [4 /*yield*/, effect];
                        case 3:
                            result = _b.apply(_a, [_g.sent()]);
                            _g.label = 4;
                        case 4: return [3 /*break*/, 11];
                        case 5:
                            if (!(effect.type === 'ctx')) return [3 /*break*/, 9];
                            context = handlers[effect.name];
                            if (!handlers.hasOwnProperty(effect.name)) return [3 /*break*/, 6];
                            result = gen.next(context);
                            return [3 /*break*/, 8];
                        case 6:
                            _d = (_c = gen).next;
                            return [4 /*yield*/, effect];
                        case 7:
                            result = _d.apply(_c, [_g.sent()]);
                            _g.label = 8;
                        case 8: return [3 /*break*/, 11];
                        case 9:
                            _f = (_e = gen).next;
                            return [4 /*yield*/, effect];
                        case 10:
                            result = _f.apply(_e, [_g.sent()]);
                            _g.label = 11;
                        case 11: return [3 /*break*/, 1];
                        case 12: return [2 /*return*/, result.value];
                    }
                });
            },
        };
    };
    return Eff;
}());
exports.Eff = Eff;
var isGenerator = function (value) {
    return typeof value === 'object' && value !== null && 'next' in value && 'throw' in value;
};
exports.isGenerator = isGenerator;
//# sourceMappingURL=koka.js.map
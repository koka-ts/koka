'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.isGenerator = exports.Eff = exports.Result = exports.EffSymbol = void 0
var tslib_1 = require('tslib')
exports.EffSymbol = Symbol('ctx')
exports.Result = {
    ok: function (value) {
        return {
            type: 'ok',
            value: value,
        }
    },
    err: function (name, error) {
        return {
            type: 'err',
            name: name,
            error: error,
        }
    },
}
function Ctx(name) {
    return /** @class */ (function () {
        function Eff() {
            this.type = 'ctx'
            this.name = name
            this.context = exports.EffSymbol
        }
        return Eff
    })()
}
function Err(name) {
    return /** @class */ (function () {
        function Eff(error) {
            this.type = 'err'
            this.name = name
            this.error = error
        }
        return Eff
    })()
}
function Opt(name) {
    return /** @class */ (function (_super) {
        tslib_1.__extends(Eff, _super)
        function Eff() {
            var _this = _super.apply(this, tslib_1.__spreadArray([], tslib_1.__read(arguments), false)) || this
            _this.optional = true
            return _this
        }
        return Eff
    })(Ctx(name))
}
var Eff = /** @class */ (function () {
    function Eff() {}
    Eff.throw = function (err) {
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    return [
                        4 /*yield*/,
                        err,
                        /* istanbul ignore next */
                    ]
                case 1:
                    _a.sent()
                    /* istanbul ignore next */
                    throw new Error('Unexpected resumption of error effect ['.concat(err.name, ']'))
            }
        })
    }
    Eff.get = function (ctx) {
        var context
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    return [4 /*yield*/, typeof ctx === 'function' ? new ctx() : ctx]
                case 1:
                    context = _a.sent()
                    return [2 /*return*/, context]
            }
        })
    }
    Eff.all = function (effects) {
        function processItem(_a) {
            var effect, _b, _c
            var result = _a.result,
                item = _a.item
            return tslib_1.__generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if (!!result.done) return [3 /*break*/, 4]
                        effect = result.value
                        if (!(effect.type === 'async')) return [3 /*break*/, 1]
                        wrapPromise(effect.promise, item)
                        return [2 /*return*/]
                    case 1:
                        _c = (_b = item.gen).next
                        return [4 /*yield*/, effect]
                    case 2:
                        result = _c.apply(_b, [_d.sent()])
                        _d.label = 3
                    case 3:
                        return [3 /*break*/, 0]
                    case 4:
                        results[item.index] = result.value
                        return [2 /*return*/]
                }
            })
        }
        var results, items, promises, wrapPromise, processedResults, processedResult, processedResult
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    results = []
                    items = effects.map(function (effect, index) {
                        var gen = typeof effect === 'function' ? effect() : effect
                        return {
                            gen: gen,
                            index: index,
                        }
                    })
                    promises = []
                    wrapPromise = function (promise, item) {
                        var wrappedPromise = promise.then(
                            function (value) {
                                promises.splice(promises.indexOf(wrappedPromise), 1)
                                processedResults.push({ item: item, result: item.gen.next(value) })
                            },
                            function (error) {
                                promises.splice(promises.indexOf(wrappedPromise), 1)
                                processedResults.push({ item: item, result: item.gen.throw(error) })
                            },
                        )
                        promises.push(wrappedPromise)
                        return wrappedPromise
                    }
                    processedResults = items.map(function (item) {
                        return {
                            item: item,
                            result: item.gen.next(),
                        }
                    })
                    _a.label = 1
                case 1:
                    if (!(processedResults.length > 0)) return [3 /*break*/, 3]
                    processedResult = processedResults.shift()
                    return [5 /*yield**/, tslib_1.__values(processItem(processedResult))]
                case 2:
                    _a.sent()
                    return [3 /*break*/, 1]
                case 3:
                    if (!(promises.length > 0)) return [3 /*break*/, 8]
                    return [5 /*yield**/, tslib_1.__values(Eff.await(Promise.race(promises)))]
                case 4:
                    _a.sent()
                    _a.label = 5
                case 5:
                    if (!(processedResults.length > 0)) return [3 /*break*/, 7]
                    processedResult = processedResults.shift()
                    return [5 /*yield**/, tslib_1.__values(processItem(processedResult))]
                case 6:
                    _a.sent()
                    return [3 /*break*/, 5]
                case 7:
                    return [3 /*break*/, 3]
                case 8:
                    return [2 /*return*/, results]
            }
        })
    }
    Eff.run = function (input) {
        var gen = typeof input === 'function' ? input() : input
        var process = function (result) {
            while (!result.done) {
                var effect = result.value
                if (effect.type === 'async') {
                    return effect.promise.then(
                        function (value) {
                            return process(gen.next(value))
                        },
                        function (error) {
                            return process(gen.throw(error))
                        },
                    )
                } else if (effect.type === 'ctx') {
                    if (!effect.optional) {
                        throw new Error(
                            'Expected optional ctx, but got non-optional ctx: '.concat(JSON.stringify(effect, null, 2)),
                        )
                    }
                    result = gen.next()
                } else {
                    throw new Error('Expected async effect, but got: '.concat(JSON.stringify(effect, null, 2)))
                }
            }
            return result.value
        }
        return process(gen.next())
    }
    Eff.runSync = function (effect) {
        var result = this.run(effect)
        if (result instanceof Promise) {
            throw new Error('Expected synchronous effect, but got asynchronous effect')
        }
        return result
    }
    Eff.runAsync = function (input) {
        return Promise.resolve(this.run(input))
    }
    Eff.runResult = function (input) {
        var gen = typeof input === 'function' ? input() : input
        // @ts-ignore expected
        return Eff.run(Eff.result(gen))
    }
    Eff.await = function (value) {
        var result
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(value instanceof Promise)) {
                        return [2 /*return*/, value]
                    }
                    return [
                        4 /*yield*/,
                        {
                            type: 'async',
                            promise: value,
                        },
                    ]
                case 1:
                    result = _a.sent()
                    return [2 /*return*/, result]
            }
        })
    }
    Eff.result = function (gen) {
        var result, effect, _a, _b
        return tslib_1.__generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    result = gen.next()
                    _c.label = 1
                case 1:
                    if (!!result.done) return [3 /*break*/, 5]
                    effect = result.value
                    if (!(effect.type === 'err')) return [3 /*break*/, 2]
                    return [2 /*return*/, effect]
                case 2:
                    _b = (_a = gen).next
                    return [4 /*yield*/, effect]
                case 3:
                    result = _b.apply(_a, [_c.sent()])
                    _c.label = 4
                case 4:
                    return [3 /*break*/, 1]
                case 5:
                    return [
                        2 /*return*/,
                        {
                            type: 'ok',
                            value: result.value,
                        },
                    ]
            }
        })
    }
    /**
     * convert a generator to a generator that returns a value
     * move the err from return to throw
     */
    Eff.ok = function (gen) {
        var result
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    return [5 /*yield**/, tslib_1.__values(gen)]
                case 1:
                    result = _a.sent()
                    if (!(result.type === 'ok')) return [3 /*break*/, 2]
                    return [2 /*return*/, result.value]
                case 2:
                    return [4 /*yield*/, result]
                case 3:
                    throw _a.sent()
            }
        })
    }
    Eff.err = function (name) {
        return {
            throw: function () {
                var _i
                var args = []
                for (_i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i]
                }
                return tslib_1.__generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            return [
                                4 /*yield*/,
                                {
                                    type: 'err',
                                    name: name,
                                    error: args[0],
                                },
                                /* istanbul ignore next */
                            ]
                        case 1:
                            _a.sent()
                            /* istanbul ignore next */
                            throw new Error('Unexpected resumption of error effect ['.concat(name, ']'))
                    }
                })
            },
        }
    }
    Eff.Err = Err
    Eff.ctx = function (name) {
        return {
            get: function () {
                var context
                return tslib_1.__generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            return [
                                4 /*yield*/,
                                {
                                    type: 'ctx',
                                    name: name,
                                    context: exports.EffSymbol,
                                },
                            ]
                        case 1:
                            context = _a.sent()
                            return [2 /*return*/, context]
                    }
                })
            },
            opt: function () {
                var context
                return tslib_1.__generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            return [
                                4 /*yield*/,
                                {
                                    type: 'ctx',
                                    name: name,
                                    context: exports.EffSymbol,
                                    optional: true,
                                },
                            ]
                        case 1:
                            context = _a.sent()
                            return [2 /*return*/, context]
                    }
                })
            },
        }
    }
    Eff.Ctx = Ctx
    Eff.Opt = Opt
    Eff.try = function (input) {
        return {
            catch: function (handlers) {
                var gen, result, effect, errorHandler, _a, _b, context, _c, _d, _e, _f
                return tslib_1.__generator(this, function (_g) {
                    switch (_g.label) {
                        case 0:
                            gen = typeof input === 'function' ? input() : input
                            result = gen.next()
                            _g.label = 1
                        case 1:
                            if (!!result.done) return [3 /*break*/, 13]
                            effect = result.value
                            if (!(effect.type === 'err')) return [3 /*break*/, 5]
                            errorHandler = handlers[effect.name]
                            if (!(typeof errorHandler === 'function')) return [3 /*break*/, 2]
                            return [2 /*return*/, errorHandler(effect.error)]
                        case 2:
                            _b = (_a = gen).next
                            return [4 /*yield*/, effect]
                        case 3:
                            result = _b.apply(_a, [_g.sent()])
                            _g.label = 4
                        case 4:
                            return [3 /*break*/, 12]
                        case 5:
                            if (!(effect.type === 'ctx')) return [3 /*break*/, 9]
                            context = handlers[effect.name]
                            if (!(context !== undefined)) return [3 /*break*/, 6]
                            result = gen.next(context)
                            return [3 /*break*/, 8]
                        case 6:
                            _d = (_c = gen).next
                            return [4 /*yield*/, effect]
                        case 7:
                            result = _d.apply(_c, [_g.sent()])
                            _g.label = 8
                        case 8:
                            return [3 /*break*/, 12]
                        case 9:
                            if (!(effect.type === 'async')) return [3 /*break*/, 11]
                            _f = (_e = gen).next
                            return [4 /*yield*/, effect]
                        case 10:
                            result = _f.apply(_e, [_g.sent()])
                            return [3 /*break*/, 12]
                        case 11:
                            effect
                            throw new Error('Unexpected effect: '.concat(JSON.stringify(effect, null, 2)))
                        case 12:
                            return [3 /*break*/, 1]
                        case 13:
                            return [2 /*return*/, result.value]
                    }
                })
            },
        }
    }
    return Eff
})()
exports.Eff = Eff
var isGenerator = function (value) {
    return typeof value === 'object' && value !== null && 'next' in value && 'throw' in value
}
exports.isGenerator = isGenerator
//# sourceMappingURL=koka.js.map

'use strict'
var _a, _b
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
    var _a
    return (
        (_a = /** @class */ (function () {
            function Eff() {
                this.type = 'ctx'
                this.name = name
                this.context = exports.EffSymbol
            }
            return Eff
        })()),
        (_a.field = name),
        _a
    )
}
function Err(name) {
    var _a
    return (
        (_a = /** @class */ (function () {
            function Eff(error) {
                this.type = 'err'
                this.name = name
                this.error = error
            }
            return Eff
        })()),
        (_a.field = name),
        _a
    )
}
function Opt(name) {
    return /** @class */ (function (_super) {
        tslib_1.__extends(Eff, _super)
        function Eff() {
            var _this = _super.apply(this, tslib_1.__spreadArray([], tslib_1.__read(arguments), false)) || this
            _this.optional = true
            _this.context = exports.EffSymbol
            return _this
        }
        return Eff
    })(Ctx(name))
}
var AbstractMsg = /** @class */ (function () {
    function AbstractMsg(message) {
        this.type = 'msg'
        this.message = message
    }
    AbstractMsg.field = ''
    return AbstractMsg
})()
function Msg(name) {
    var _a
    return (
        (_a = /** @class */ (function (_super) {
            tslib_1.__extends(Eff, _super)
            function Eff() {
                var _this = _super.apply(this, tslib_1.__spreadArray([], tslib_1.__read(arguments), false)) || this
                _this.name = name
                return _this
            }
            return Eff
        })(AbstractMsg)),
        (_a.field = name),
        _a
    )
}
var cleanUpGen = function (gen) {
    var result = gen.return(undefined)
    if (!result.done) {
        throw new Error('You can not use yield in the finally block of a generator')
    }
}
var withResolvers =
    (_b = (_a = Promise.withResolvers) === null || _a === void 0 ? void 0 : _a.bind(Promise)) !== null && _b !== void 0
        ? _b
        : function () {
              var resolve
              var reject
              var promise = new Promise(function (res, rej) {
                  resolve = res
                  reject = rej
              })
              // @ts-ignore as expected
              return { promise: promise, resolve: resolve, reject: reject }
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
    Eff.send = function (message) {
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    return [4 /*yield*/, message]
                case 1:
                    _a.sent()
                    return [2 /*return*/]
            }
        })
    }
    Eff.wait = function (msg) {
        var message
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    return [
                        4 /*yield*/,
                        {
                            type: 'msg',
                            name: msg.field,
                        },
                    ]
                case 1:
                    message = _a.sent()
                    return [2 /*return*/, message]
            }
        })
    }
    Eff.communicate = function (inputs) {
        var gens,
            results,
            _a,
            _b,
            _c,
            key,
            value,
            sendStorage,
            waitStorage,
            queue,
            process,
            _d,
            _e,
            _f,
            key,
            gen,
            e_1_1,
            item,
            _g,
            _h,
            gen
        var e_2, _j, e_1, _k, e_3, _l
        return tslib_1.__generator(this, function (_m) {
            switch (_m.label) {
                case 0:
                    gens = {}
                    results = {}
                    try {
                        for (_a = tslib_1.__values(Object.entries(inputs)), _b = _a.next(); !_b.done; _b = _a.next()) {
                            ;(_c = tslib_1.__read(_b.value, 2)), (key = _c[0]), (value = _c[1])
                            if (typeof value === 'function') {
                                gens[key] = value()
                            } else if ((0, exports.isGenerator)(value)) {
                                gens[key] = value
                            } else {
                                gens[key] = Eff.of(value)
                            }
                        }
                    } catch (e_2_1) {
                        e_2 = { error: e_2_1 }
                    } finally {
                        try {
                            if (_b && !_b.done && (_j = _a.return)) _j.call(_a)
                        } finally {
                            if (e_2) throw e_2.error
                        }
                    }
                    sendStorage = {}
                    waitStorage = {}
                    queue = []
                    process = function (key, gen, result) {
                        var effect, waitItem, sendedItem, _a, _b
                        return tslib_1.__generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    if (!!result.done) return [3 /*break*/, 13]
                                    effect = result.value
                                    if (!(effect.type === 'msg')) return [3 /*break*/, 10]
                                    if (!(effect.message !== undefined)) return [3 /*break*/, 4]
                                    if (!(effect.name in waitStorage)) return [3 /*break*/, 2]
                                    waitItem = waitStorage[effect.name]
                                    delete waitStorage[effect.name]
                                    queue.splice(queue.indexOf(waitItem), 1)
                                    return [
                                        5 /*yield**/,
                                        tslib_1.__values(
                                            process(waitItem.key, waitItem.gen, waitItem.gen.next(effect.message)),
                                        ),
                                    ]
                                case 1:
                                    _c.sent()
                                    result = gen.next()
                                    return [3 /*break*/, 3]
                                case 2:
                                    sendStorage[effect.name] = {
                                        type: 'send',
                                        name: effect.name,
                                        key: key,
                                        gen: gen,
                                        message: effect.message,
                                    }
                                    queue.push(sendStorage[effect.name])
                                    return [2 /*return*/]
                                case 3:
                                    return [3 /*break*/, 9]
                                case 4:
                                    if (!(effect.name in sendStorage)) return [3 /*break*/, 7]
                                    sendedItem = sendStorage[effect.name]
                                    delete sendStorage[effect.name]
                                    queue.splice(queue.indexOf(sendedItem), 1)
                                    return [
                                        5 /*yield**/,
                                        tslib_1.__values(process(key, gen, gen.next(sendedItem.message))),
                                    ]
                                case 5:
                                    _c.sent()
                                    return [
                                        5 /*yield**/,
                                        tslib_1.__values(
                                            process(sendedItem.key, sendedItem.gen, sendedItem.gen.next()),
                                        ),
                                    ]
                                case 6:
                                    _c.sent()
                                    return [2 /*return*/]
                                case 7:
                                    waitStorage[effect.name] = {
                                        type: 'wait',
                                        name: effect.name,
                                        key: key,
                                        gen: gen,
                                    }
                                    queue.push(waitStorage[effect.name])
                                    _c.label = 8
                                case 8:
                                    return [2 /*return*/]
                                case 9:
                                    return [3 /*break*/, 12]
                                case 10:
                                    _b = (_a = gen).next
                                    return [4 /*yield*/, effect]
                                case 11:
                                    result = _b.apply(_a, [_c.sent()])
                                    _c.label = 12
                                case 12:
                                    return [3 /*break*/, 0]
                                case 13:
                                    results[key] = result.value
                                    return [2 /*return*/]
                            }
                        })
                    }
                    _m.label = 1
                case 1:
                    _m.trys.push([1, , 15, 16])
                    _m.label = 2
                case 2:
                    _m.trys.push([2, 7, 8, 9])
                    ;(_d = tslib_1.__values(Object.entries(gens))), (_e = _d.next())
                    _m.label = 3
                case 3:
                    if (!!_e.done) return [3 /*break*/, 6]
                    ;(_f = tslib_1.__read(_e.value, 2)), (key = _f[0]), (gen = _f[1])
                    return [5 /*yield**/, tslib_1.__values(process(key, gen, gen.next()))]
                case 4:
                    _m.sent()
                    _m.label = 5
                case 5:
                    _e = _d.next()
                    return [3 /*break*/, 3]
                case 6:
                    return [3 /*break*/, 9]
                case 7:
                    e_1_1 = _m.sent()
                    e_1 = { error: e_1_1 }
                    return [3 /*break*/, 9]
                case 8:
                    try {
                        if (_e && !_e.done && (_k = _d.return)) _k.call(_d)
                    } finally {
                        if (e_1) throw e_1.error
                    }
                    return [7 /*endfinally*/]
                case 9:
                    if (!(queue.length > 0)) return [3 /*break*/, 14]
                    item = queue.shift()
                    if (!(item.type === 'send')) return [3 /*break*/, 11]
                    return [
                        5 /*yield**/,
                        tslib_1.__values(
                            process(
                                item.key,
                                item.gen,
                                item.gen.throw(
                                    new Error(
                                        "Message '"
                                            .concat(item.name, "' sent by '")
                                            .concat(item.key, "' was not received"),
                                    ),
                                ),
                            ),
                        ),
                    ]
                case 10:
                    _m.sent()
                    return [3 /*break*/, 13]
                case 11:
                    return [
                        5 /*yield**/,
                        tslib_1.__values(
                            process(
                                item.key,
                                item.gen,
                                item.gen.throw(
                                    new Error(
                                        "Message '"
                                            .concat(item.name, "' waited by '")
                                            .concat(item.key, "' was not sent"),
                                    ),
                                ),
                            ),
                        ),
                    ]
                case 12:
                    _m.sent()
                    _m.label = 13
                case 13:
                    return [3 /*break*/, 9]
                case 14:
                    if (Object.keys(results).length !== Object.keys(gens).length) {
                        throw new Error('Some messages were not processed: '.concat(JSON.stringify(Object.keys(gens))))
                    }
                    return [2 /*return*/, results]
                case 15:
                    try {
                        for (_g = tslib_1.__values(Object.values(gens)), _h = _g.next(); !_h.done; _h = _g.next()) {
                            gen = _h.value
                            cleanUpGen(gen)
                        }
                    } catch (e_3_1) {
                        e_3 = { error: e_3_1 }
                    } finally {
                        try {
                            if (_h && !_h.done && (_l = _g.return)) _l.call(_g)
                        } finally {
                            if (e_3) throw e_3.error
                        }
                    }
                    return [7 /*endfinally*/]
                case 16:
                    return [2 /*return*/]
            }
        })
    }
    Eff.of = function (value) {
        return tslib_1.__generator(this, function (_a) {
            return [2 /*return*/, value]
        })
    }
    Eff.stream = function (inputs, handler) {
        function createAsyncGen() {
            return tslib_1.__asyncGenerator(this, arguments, function createAsyncGen_1() {
                var count, item
                return tslib_1.__generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            count = 0
                            _a.label = 1
                        case 1:
                            if (!(count < items.length)) return [3 /*break*/, 7]
                            return [4 /*yield*/, tslib_1.__await(controller.promise)]
                        case 2:
                            _a.sent()
                            _a.label = 3
                        case 3:
                            if (!(processedItems.length > 0)) return [3 /*break*/, 6]
                            item = processedItems.shift()
                            return [
                                4 /*yield*/,
                                tslib_1.__await({
                                    index: item.index,
                                    value: item.value,
                                }),
                            ]
                        case 4:
                            return [4 /*yield*/, _a.sent()]
                        case 5:
                            _a.sent()
                            count++
                            return [3 /*break*/, 3]
                        case 6:
                            return [3 /*break*/, 1]
                        case 7:
                            return [2 /*return*/]
                    }
                })
            })
        }
        var items,
            inputs_1,
            inputs_1_1,
            input,
            gen,
            controller,
            processedItems,
            asyncGen,
            cleanUpAllGen,
            promises_1,
            processResults_1,
            wrapPromise_1,
            processItem,
            handlerResult_1,
            handlerPromise,
            items_1,
            items_1_1,
            item,
            e_4_1,
            result,
            processResult,
            item,
            result,
            previousController,
            result
        var e_5, _a, e_4, _b
        return tslib_1.__generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    items = []
                    try {
                        for (
                            inputs_1 = tslib_1.__values(inputs), inputs_1_1 = inputs_1.next();
                            !inputs_1_1.done;
                            inputs_1_1 = inputs_1.next()
                        ) {
                            input = inputs_1_1.value
                            gen = typeof input === 'function' ? input() : input
                            items.push({
                                type: 'initial',
                                gen: gen,
                                index: items.length,
                            })
                        }
                    } catch (e_5_1) {
                        e_5 = { error: e_5_1 }
                    } finally {
                        try {
                            if (inputs_1_1 && !inputs_1_1.done && (_a = inputs_1.return)) _a.call(inputs_1)
                        } finally {
                            if (e_5) throw e_5.error
                        }
                    }
                    controller = withResolvers()
                    processedItems = []
                    asyncGen = createAsyncGen()
                    cleanUpAllGen = function () {
                        var e_6, _a
                        try {
                            // Clean up any remaining items
                            for (
                                var items_2 = tslib_1.__values(items), items_2_1 = items_2.next();
                                !items_2_1.done;
                                items_2_1 = items_2.next()
                            ) {
                                var item = items_2_1.value
                                if (item.type !== 'completed') {
                                    cleanUpGen(item.gen)
                                }
                            }
                        } catch (e_6_1) {
                            e_6 = { error: e_6_1 }
                        } finally {
                            try {
                                if (items_2_1 && !items_2_1.done && (_a = items_2.return)) _a.call(items_2)
                            } finally {
                                if (e_6) throw e_6.error
                            }
                        }
                    }
                    _c.label = 1
                case 1:
                    _c.trys.push([1, , 17, 18])
                    promises_1 = []
                    processResults_1 = []
                    wrapPromise_1 = function (promise, item) {
                        var wrappedPromise = promise.then(
                            function (value) {
                                promises_1.splice(promises_1.indexOf(wrappedPromise), 1)
                                processResults_1.push({
                                    type: 'ok',
                                    item: item,
                                    value: value,
                                })
                            },
                            function (error) {
                                promises_1.splice(promises_1.indexOf(wrappedPromise), 1)
                                processResults_1.push({
                                    type: 'err',
                                    item: item,
                                    error: error,
                                })
                            },
                        )
                        promises_1.push(wrappedPromise)
                        return wrappedPromise
                    }
                    processItem = function (item, result) {
                        var effect, _a, _b, processedItem
                        return tslib_1.__generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    if (!!result.done) return [3 /*break*/, 4]
                                    effect = result.value
                                    if (!(effect.type === 'async')) return [3 /*break*/, 1]
                                    wrapPromise_1(effect.promise, item)
                                    return [2 /*return*/]
                                case 1:
                                    _b = (_a = item.gen).next
                                    return [4 /*yield*/, effect]
                                case 2:
                                    result = _b.apply(_a, [_c.sent()])
                                    _c.label = 3
                                case 3:
                                    return [3 /*break*/, 0]
                                case 4:
                                    if (item.type === 'initial') {
                                        processedItem = {
                                            type: 'completed',
                                            index: item.index,
                                            gen: item.gen,
                                            value: result.value,
                                        }
                                        items[item.index] = processedItem
                                        processedItems.push(processedItem)
                                    } else if (item.type === 'completed') {
                                        throw new Error(
                                            'Unexpected completion of item that was already completed: '.concat(
                                                JSON.stringify(item, null, 2),
                                            ),
                                        )
                                    } else {
                                        item
                                        throw new Error('Unexpected item type: '.concat(JSON.stringify(item, null, 2)))
                                    }
                                    return [2 /*return*/]
                            }
                        })
                    }
                    handlerPromise = handler(asyncGen).then(
                        function (value) {
                            handlerResult_1 = {
                                type: 'ok',
                                value: value,
                            }
                            return handlerResult_1
                        },
                        function (error) {
                            handlerResult_1 = {
                                type: 'err',
                                error: error,
                            }
                            return handlerResult_1
                        },
                    )
                    promises_1.push(handlerPromise)
                    _c.label = 2
                case 2:
                    _c.trys.push([2, 7, 8, 9])
                    ;(items_1 = tslib_1.__values(items)), (items_1_1 = items_1.next())
                    _c.label = 3
                case 3:
                    if (!!items_1_1.done) return [3 /*break*/, 6]
                    item = items_1_1.value
                    return [5 /*yield**/, tslib_1.__values(processItem(item, item.gen.next()))]
                case 4:
                    _c.sent()
                    _c.label = 5
                case 5:
                    items_1_1 = items_1.next()
                    return [3 /*break*/, 3]
                case 6:
                    return [3 /*break*/, 9]
                case 7:
                    e_4_1 = _c.sent()
                    e_4 = { error: e_4_1 }
                    return [3 /*break*/, 9]
                case 8:
                    try {
                        if (items_1_1 && !items_1_1.done && (_b = items_1.return)) _b.call(items_1)
                    } finally {
                        if (e_4) throw e_4.error
                    }
                    return [7 /*endfinally*/]
                case 9:
                    if (!(promises_1.length > 0)) return [3 /*break*/, 16]
                    if (handlerResult_1) {
                        return [3 /*break*/, 16]
                    }
                    if (!(promises_1.length !== 1)) return [3 /*break*/, 11]
                    return [5 /*yield**/, tslib_1.__values(Eff.await(Promise.race(promises_1)))]
                case 10:
                    result = _c.sent()
                    if (result) {
                        return [3 /*break*/, 16]
                    }
                    _c.label = 11
                case 11:
                    if (!(processResults_1.length > 0)) return [3 /*break*/, 13]
                    processResult = processResults_1.shift()
                    item = processResult.item
                    result = void 0
                    if (processResult.type === 'ok') {
                        result = item.gen.next(processResult.value)
                    } else {
                        result = item.gen.throw(processResult.error)
                    }
                    return [5 /*yield**/, tslib_1.__values(processItem(item, result))]
                case 12:
                    _c.sent()
                    return [3 /*break*/, 11]
                case 13:
                    if (processedItems.length > 0) {
                        previousController = controller
                        controller = withResolvers()
                        previousController.resolve()
                    }
                    if (!(promises_1.length === 1)) return [3 /*break*/, 15]
                    return [5 /*yield**/, tslib_1.__values(Eff.await(promises_1[0]))]
                case 14:
                    result = _c.sent()
                    if (result) {
                        return [3 /*break*/, 16]
                    }
                    _c.label = 15
                case 15:
                    return [3 /*break*/, 9]
                case 16:
                    if (!handlerResult_1) {
                        throw new Error('Handler did not resolve or reject')
                    }
                    if (handlerResult_1.type === 'err') {
                        throw handlerResult_1.error
                    } else {
                        return [2 /*return*/, handlerResult_1.value]
                    }
                    return [3 /*break*/, 18]
                case 17:
                    cleanUpAllGen()
                    return [7 /*endfinally*/]
                case 18:
                    return [2 /*return*/]
            }
        })
    }
    Eff.combine = function (inputs) {
        var result, gens, keys, _a, _b, _c, key, value, values, i
        var e_7, _d
        return tslib_1.__generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    if (!Array.isArray(inputs)) return [3 /*break*/, 2]
                    return [5 /*yield**/, tslib_1.__values(Eff.all(inputs))]
                case 1:
                    return [2 /*return*/, _e.sent()]
                case 2:
                    result = {}
                    gens = []
                    keys = []
                    try {
                        for (_a = tslib_1.__values(Object.entries(inputs)), _b = _a.next(); !_b.done; _b = _a.next()) {
                            ;(_c = tslib_1.__read(_b.value, 2)), (key = _c[0]), (value = _c[1])
                            if (typeof value === 'function') {
                                gens.push(value())
                            } else if ((0, exports.isGenerator)(value)) {
                                gens.push(value)
                            } else {
                                gens.push(Eff.of(value))
                            }
                            keys.push(key)
                        }
                    } catch (e_7_1) {
                        e_7 = { error: e_7_1 }
                    } finally {
                        try {
                            if (_b && !_b.done && (_d = _a.return)) _d.call(_a)
                        } finally {
                            if (e_7) throw e_7.error
                        }
                    }
                    return [5 /*yield**/, tslib_1.__values(Eff.all(gens))]
                case 3:
                    values = _e.sent()
                    for (i = 0; i < values.length; i++) {
                        result[keys[i]] = values[i]
                    }
                    return [2 /*return*/, result]
            }
        })
    }
    Eff.all = function (inputs) {
        var results
        var _this = this
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    return [
                        5 /*yield**/,
                        tslib_1.__values(
                            Eff.stream(inputs, function (stream) {
                                return tslib_1.__awaiter(_this, void 0, void 0, function () {
                                    var results, index, value, e_8_1
                                    var _a, stream_1, stream_1_1
                                    var _b, e_8, _c, _d
                                    return tslib_1.__generator(this, function (_e) {
                                        switch (_e.label) {
                                            case 0:
                                                results = []
                                                _e.label = 1
                                            case 1:
                                                _e.trys.push([1, 6, 7, 12])
                                                ;(_a = true), (stream_1 = tslib_1.__asyncValues(stream))
                                                _e.label = 2
                                            case 2:
                                                return [4 /*yield*/, stream_1.next()]
                                            case 3:
                                                if (!((stream_1_1 = _e.sent()), (_b = stream_1_1.done), !_b))
                                                    return [3 /*break*/, 5]
                                                _d = stream_1_1.value
                                                _a = false
                                                ;(index = _d.index), (value = _d.value)
                                                results[index] = value
                                                _e.label = 4
                                            case 4:
                                                _a = true
                                                return [3 /*break*/, 2]
                                            case 5:
                                                return [3 /*break*/, 12]
                                            case 6:
                                                e_8_1 = _e.sent()
                                                e_8 = { error: e_8_1 }
                                                return [3 /*break*/, 12]
                                            case 7:
                                                _e.trys.push([7, , 10, 11])
                                                if (!(!_a && !_b && (_c = stream_1.return))) return [3 /*break*/, 9]
                                                return [4 /*yield*/, _c.call(stream_1)]
                                            case 8:
                                                _e.sent()
                                                _e.label = 9
                                            case 9:
                                                return [3 /*break*/, 11]
                                            case 10:
                                                if (e_8) throw e_8.error
                                                return [7 /*endfinally*/]
                                            case 11:
                                                return [7 /*endfinally*/]
                                            case 12:
                                                return [2 /*return*/, results]
                                        }
                                    })
                                })
                            }),
                        ),
                    ]
                case 1:
                    results = _a.sent()
                    return [2 /*return*/, results]
            }
        })
    }
    Eff.race = function (inputs) {
        var result
        var _this = this
        return tslib_1.__generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    return [
                        5 /*yield**/,
                        tslib_1.__values(
                            Eff.stream(inputs, function (stream) {
                                return tslib_1.__awaiter(_this, void 0, void 0, function () {
                                    var value, e_9_1
                                    var _a, stream_2, stream_2_1
                                    var _b, e_9, _c, _d
                                    return tslib_1.__generator(this, function (_e) {
                                        switch (_e.label) {
                                            case 0:
                                                _e.trys.push([0, 5, 6, 11])
                                                ;(_a = true), (stream_2 = tslib_1.__asyncValues(stream))
                                                _e.label = 1
                                            case 1:
                                                return [4 /*yield*/, stream_2.next()]
                                            case 2:
                                                if (!((stream_2_1 = _e.sent()), (_b = stream_2_1.done), !_b))
                                                    return [3 /*break*/, 4]
                                                _d = stream_2_1.value
                                                _a = false
                                                value = _d.value
                                                return [2 /*return*/, value]
                                            case 3:
                                                _a = true
                                                return [3 /*break*/, 1]
                                            case 4:
                                                return [3 /*break*/, 11]
                                            case 5:
                                                e_9_1 = _e.sent()
                                                e_9 = { error: e_9_1 }
                                                return [3 /*break*/, 11]
                                            case 6:
                                                _e.trys.push([6, , 9, 10])
                                                if (!(!_a && !_b && (_c = stream_2.return))) return [3 /*break*/, 8]
                                                return [4 /*yield*/, _c.call(stream_2)]
                                            case 7:
                                                _e.sent()
                                                _e.label = 8
                                            case 8:
                                                return [3 /*break*/, 10]
                                            case 9:
                                                if (e_9) throw e_9.error
                                                return [7 /*endfinally*/]
                                            case 10:
                                                return [7 /*endfinally*/]
                                            case 11:
                                                throw new Error('No results in race')
                                        }
                                    })
                                })
                            }),
                        ),
                    ]
                case 1:
                    result = _a.sent()
                    return [2 /*return*/, result]
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
                    _c.trys.push([0, , 6, 7])
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
                case 6:
                    cleanUpGen(gen)
                    return [7 /*endfinally*/]
                case 7:
                    return [2 /*return*/]
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
    Eff.msg = function (name) {
        return {
            send: function (message) {
                return tslib_1.__generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            return [4 /*yield*/, { type: 'msg', name: name, message: message }]
                        case 1:
                            _a.sent()
                            return [2 /*return*/]
                    }
                })
            },
            wait: function () {
                var message
                return tslib_1.__generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            return [4 /*yield*/, { type: 'msg', name: name }]
                        case 1:
                            message = _a.sent()
                            return [2 /*return*/, message]
                    }
                })
            },
        }
    }
    Eff.Msg = Msg
    Eff.try = function (input) {
        return {
            handle: function (handlers) {
                var gen, result, effect, errorHandler, _a, _b, context, _c, _d, _e, _f, _g, _h
                return tslib_1.__generator(this, function (_j) {
                    switch (_j.label) {
                        case 0:
                            gen = typeof input === 'function' ? input() : input
                            _j.label = 1
                        case 1:
                            _j.trys.push([1, , 17, 18])
                            result = gen.next()
                            _j.label = 2
                        case 2:
                            if (!!result.done) return [3 /*break*/, 16]
                            effect = result.value
                            if (!(effect.type === 'err')) return [3 /*break*/, 6]
                            errorHandler = handlers[effect.name]
                            if (!(typeof errorHandler === 'function')) return [3 /*break*/, 3]
                            return [2 /*return*/, errorHandler(effect.error)]
                        case 3:
                            _b = (_a = gen).next
                            return [4 /*yield*/, effect]
                        case 4:
                            result = _b.apply(_a, [_j.sent()])
                            _j.label = 5
                        case 5:
                            return [3 /*break*/, 15]
                        case 6:
                            if (!(effect.type === 'ctx')) return [3 /*break*/, 10]
                            context = handlers[effect.name]
                            if (!(context !== undefined)) return [3 /*break*/, 7]
                            result = gen.next(context)
                            return [3 /*break*/, 9]
                        case 7:
                            _d = (_c = gen).next
                            return [4 /*yield*/, effect]
                        case 8:
                            result = _d.apply(_c, [_j.sent()])
                            _j.label = 9
                        case 9:
                            return [3 /*break*/, 15]
                        case 10:
                            if (!(effect.type === 'async')) return [3 /*break*/, 12]
                            _f = (_e = gen).next
                            return [4 /*yield*/, effect]
                        case 11:
                            result = _f.apply(_e, [_j.sent()])
                            return [3 /*break*/, 15]
                        case 12:
                            if (!(effect.type === 'msg')) return [3 /*break*/, 14]
                            _h = (_g = gen).next
                            return [4 /*yield*/, effect]
                        case 13:
                            result = _h.apply(_g, [_j.sent()])
                            return [3 /*break*/, 15]
                        case 14:
                            effect
                            throw new Error('Unexpected effect: '.concat(JSON.stringify(effect, null, 2)))
                        case 15:
                            return [3 /*break*/, 2]
                        case 16:
                            return [2 /*return*/, result.value]
                        case 17:
                            cleanUpGen(gen)
                            return [7 /*endfinally*/]
                        case 18:
                            return [2 /*return*/]
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

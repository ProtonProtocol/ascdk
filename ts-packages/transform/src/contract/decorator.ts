import { CharCode, DecoratorKind, DecoratorNode, Expression, IdentifierExpression, NodeKind } from "assemblyscript";
import { ContractDecoratorKind } from "../enums/decorator";
import { DecoratorUtil } from "../utils/decoratorutil";
import { Strings } from "../utils/primitiveutil";
import { AstUtil, RangeUtil } from "../utils/utils";

function fromNode(nameNode: Expression): ContractDecoratorKind {
    if (nameNode.kind == NodeKind.IDENTIFIER) {
        let nameStr = (<IdentifierExpression>nameNode).text;
        switch (nameStr.charCodeAt(0)) {
            case CharCode.c: {
                if (nameStr == "contract") return ContractDecoratorKind.CONTRACT;
                if (nameStr == "constructor") return ContractDecoratorKind.CONSTRUCTOR;
                break;
            }
            case CharCode.d: {
                if (nameStr == 'doc') return ContractDecoratorKind.DOC;
                if (nameStr == "dynamic") return ContractDecoratorKind.DYNAMIC;
                break;
            }
            case CharCode.e: {
                if (nameStr == "event") return ContractDecoratorKind.EVENT;
                break;
            }
            case CharCode.m: {
                if (nameStr == "message") return ContractDecoratorKind.MESSAGE;
                break;
            }
            case CharCode.p: {
                if (nameStr == "packed") return ContractDecoratorKind.PACKED;
                break;
            }
            case CharCode.s: {
                if (nameStr == "spread") return ContractDecoratorKind.SPREAD;
                if (nameStr == "state") return ContractDecoratorKind.STATE;
                break;
            }
            case CharCode.t: {
                if (nameStr == "topic") return ContractDecoratorKind.TOPIC;
                break;
            }
        }
    }
    return ContractDecoratorKind.OTHER;
}

export function getCustomDecoratorKind(decorator: DecoratorNode): ContractDecoratorKind {
    if (decorator.decoratorKind != DecoratorKind.CUSTOM) {
        return ContractDecoratorKind.INTERNAL;
    }
    let kind = fromNode(decorator.name);
    if (kind == ContractDecoratorKind.OTHER) {
        let name = getSimilarityDecorator(decorator.name.range.toString());
        throw new Error(`Unsupported contract decorator ${decorator.name.range.toString()}, do you mean '@${name}'? Check ${RangeUtil.location(decorator.range)}`);
    }
    return kind;
}

export function getSimilarityDecorator(name: string): string {
    let possibleDecorator = "";
    let percentOfSimilar = 0;
    let innerDecorators = ["contract", "constructor", "doc", "dynamic", "event", "message", "packed", "spread", "state", "topic"];
    for (let decorator of innerDecorators) {
        let similarity = Strings.similarity(decorator, name);
        if (similarity > percentOfSimilar) {
            percentOfSimilar = similarity;
            possibleDecorator = decorator;
        }
    }
    return possibleDecorator;
}


export function toPairs(decorator: DecoratorNode): Map<string, string> {
    let pairs = new Map<string, string>();

    decorator.args && decorator.args.forEach(expression => {
        if (expression.kind == NodeKind.BINARY) {
            let identifier = AstUtil.getIdentifier(expression);
            let val = AstUtil.getBinaryExprRight(expression);
            pairs.set(identifier, val.trim());
        }
        // Todo using the strict logical
        if (expression.kind == NodeKind.LITERAL) {
            let exp = expression.range.toString().trim();
            let regex = new RegExp(/{|}|,/);
            regex.test(exp);
            let result = Strings.splitString(exp, regex);
            for (let item of result) {
                let pairItem = item.split(/:/);
                pairs.set(pairItem[0].trim(), pairItem[1].trim());
            }
        }
    });
    return pairs;
}

function checkDecoratorField(map: Map<string, string>, key: string, required: boolean, regex: RegExp, defaultVal: string): void {
    if (required && !map.has(key)) {
        throw Error(`field ${key} is not exist.`);
    }
    if (map.has(key)) {
        let val = map.get(key)!;
        if (!regex.test(val)) {
            throw Error(`filed ${key} should match the pattern ${regex}`);
        }
    } else {
        map.set(key, defaultVal);
    }
}
export class DecoratorNodeDef {
    jsonObj: any;
    constructor(public decorator: DecoratorNode) {
        this.jsonObj = this.parseToJson(decorator);
    }

    private parseToJson(decorator: DecoratorNode): any {
        if (!decorator.args) {
            return {};
        }
        if (decorator.args?.length == 1) {
            try {
                let exp = decorator.args![0].range.toString();
                return JSON.parse(exp);
            } catch (e) {
                throw new Error(`The decorator parameter isn't json format. Check ${RangeUtil.location(decorator.range)}.`);
            }
        }
        throw new Error(`The decorator parameter isn't pre-defined format. Check ${RangeUtil.location(decorator.range)}.`);
    }

    hasProperty(key: string): boolean {
        return this.jsonObj.hasOwnProperty(key);
    }

    getProperty(key: string, type = ""): any {
        if (this.hasProperty(key)) {
            let obj = this.jsonObj[key];
            if (type && !DecoratorUtil.checkObjType(obj, type)) {
                throw new Error(`Decorator: ${this.decorator.name.range.toString()} argument mutates value should be false. Trace: ${RangeUtil.location(this.decorator.range)} `);
            }
            return obj;
        } else {
            DecoratorUtil.throwNoArguException(this.decorator, key);
        }
    }

    getIfAbsent(key: string, obj: any, type = ""): any {
        if (this.hasProperty(key)) {
            let obj = this.jsonObj[key];
            if (type && !DecoratorUtil.checkObjType(obj, type)) {
                throw new Error(`Decorator: ${this.decorator.name.range.toString()} argument mutates value should be false. Trace: ${RangeUtil.location(this.decorator.range)} `);
            }
            return obj;
        }
        return obj;
    }
}

/**
 * Doc decorator info
 */
export class DocDecoratorNodeDef extends DecoratorNodeDef {
    constructor(decorator: DecoratorNode, public doc = "") {
        super(decorator);
        this.doc = this.getProperty("desc", "string");
    }
}
export class MessageDecoratorNodeDef extends DecoratorNodeDef {
    constructor(decorator: DecoratorNode, public payable = false,
        public mutates = true, public selector = "") {
        super(decorator);
        this.payable = this.getIfAbsent("payable", false, "boolean");
        this.mutates = this.getIfAbsent('mutates', true, "boolean");
        if (this.hasProperty('selector')) {
            this.selector = this.getProperty('selector');
            DecoratorUtil.checkSelector(decorator, this.selector);
        }
        if (this.payable && !this.mutates) {
            throw new Error(`Decorator: ${decorator.name.range.toString()} arguments mutates and payable can only exist one. Trace: ${RangeUtil.location(decorator.range)} `);
        }
    }
}
export class StateDecoratorNodeDef extends DecoratorNodeDef {
    constructor(decorator: DecoratorNode, public lazy = true, public ignore = false) {
        super(decorator);
        this.lazy = this.getIfAbsent("lazy", true, "boolean");
    }
}

export function getDecoratorDef(decorator: DecoratorNode): DecoratorNodeDef {
    switch (getCustomDecoratorKind(decorator)) {
        case ContractDecoratorKind.STATE: {
            return new StateDecoratorNodeDef(decorator);
        }
        case ContractDecoratorKind.DOC: {
            return new DocDecoratorNodeDef(decorator);
        }
        case ContractDecoratorKind.MESSAGE: {
            return new MessageDecoratorNodeDef(decorator);
        }
    }
    return new DecoratorNodeDef(decorator);
}
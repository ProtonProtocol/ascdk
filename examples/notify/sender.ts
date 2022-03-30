import {
    print,
    requireRecipient,
    Name,
    Contract,
} from "as-chain";

@contract("hello")
class MyContract extends Contract {
    @action("sayhello")
    sayHello(name: string): void {
        print(`hello ${name}!`);
        requireRecipient(Name.fromString('helloworld11'));
    }
}

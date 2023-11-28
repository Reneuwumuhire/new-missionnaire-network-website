export class Failure extends  Error{
    public message: string;
    public name: string;
    constructor(name: string, message: string){
        super(message);
        this.name = name;
        this.message = message;
    }
}
export class InternalFailure extends Failure {
    constructor(message: string, name = "internal-failure"){
        super(name, message);
    }
}


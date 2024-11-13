export class PlaceMainPageDto{
    constructor({id, name}) {
      this.id = id;
      this.name = name;
    }

    id: number;
    name: string;
}
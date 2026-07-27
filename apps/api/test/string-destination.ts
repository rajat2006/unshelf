export class StringDestination {
  output = "";

  write(chunk: string | Uint8Array): boolean {
    this.output += chunk.toString();
    return true;
  }
}

# Use an official lightweight Go image as the base
FROM golang:1.20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy the Go module files and download dependencies
COPY go.mod ./
RUN go mod download

# Copy the rest of the application source code
COPY . .

# Build the Go application
RUN go build -o main .

# Expose the port on which the app runs
EXPOSE 80

# Command to run the application
CMD ["./main"]

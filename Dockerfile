FROM maven:3.9.9-eclipse-temurin-21 AS deps
WORKDIR /app
COPY pom.xml ./
RUN mvn -B -q -DskipTests dependency:go-offline

FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY --from=deps /root/.m2 /root/.m2
COPY pom.xml ./
COPY src ./src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:21-jre-jammy AS prod
WORKDIR /app
ENV JAVA_OPTS=""
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl jq ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/notifications-*.jar /app/app.jar
COPY scripts/openbao-run.sh /app/scripts/openbao-run.sh
RUN chmod +x /app/scripts/openbao-run.sh
EXPOSE 8080
CMD ["sh", "-lc", "exec java $JAVA_OPTS -jar /app/app.jar"]

FROM prod AS local
